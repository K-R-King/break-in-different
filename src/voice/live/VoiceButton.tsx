import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { COPY } from "../../copy";
import { formatCombo, isCapturing, isModifierCode, matchesCombo, useVoiceKey } from "../hotkey";
import { useLiveVoice } from "./LiveVoice";
import { useIntentStatus } from "../intent/VoiceIntent";
import "./voice.css";

// Top-layer support (all current browsers); without it the button simply stays in the header.
const POPOVER = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

const LINGER_MS = 12000; // the last line heard stays under the button this long after listening ends

// The voice control button: green glow while the microphone is really being heard, the line being
// heard underneath it in real time. The glow fades out when listening ends.
// The shortcut is the one set in Accessibility settings (default Ctrl+Space): in "hold" mode, talk
// while holding it; in "toggle" mode, press once to start and again to stop. Enter or Space on the
// focused button also toggles it.
export function VoiceButton() {
  const v = useLiveVoice();
  const heardRef = useRef<HTMLParagraphElement>(null);
  const intent = useIntentStatus();
  const { combo, mode } = useVoiceKey();
  const descId = useId();
  const on = v.status !== "off";
  const heard = v.status === "listening" && !v.muted;
  const shortcut = formatCombo(combo);

  const label =
    v.status === "starting"
      ? COPY.voice.connecting
      : v.status === "reconnecting"
        ? COPY.voice.reconnecting
        : v.status === "listening"
          ? v.muted
            ? COPY.voice.muted
            : COPY.voice.listening
          : COPY.voice.button;

  // Keep the last line visible for a moment after listening ends.
  const [linger, setLinger] = useState(false);
  useEffect(() => {
    if (on || !v.transcript) return setLinger(false);
    setLinger(true);
    const t = window.setTimeout(() => setLinger(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [on, v.transcript]);

  const latest = useRef({ v, mode });
  latest.current = { v, mode };
  useEffect(() => {
    let held = false;
    const onDown = (e: KeyboardEvent) => {
      const { v, mode } = latest.current;
      if (e.key === "Escape" && v.session.active) {
        v.stop();
        return;
      }
      if (isCapturing() || e.repeat || !matchesCombo(e, combo)) return;
      e.preventDefault();
      if (mode === "toggle") return v.toggle();
      held = true;
      v.session.start();
    };
    // Hold mode: letting go of the key or a modifier finishes what was said, then stops.
    const onUp = (e: KeyboardEvent) => {
      if (held && (e.code === combo.code || isModifierCode(e.code))) {
        held = false;
        latest.current.v.session.stop(true);
      }
    };
    const onBlur = () => {
      if (held) {
        held = false;
        latest.current.v.session.stop(true);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [combo]);

  // A long command scrolls inside the panel; keep the newest words in view.
  useEffect(() => {
    const el = heardRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [v.transcript]);

  const showPanel = on || linger || !!v.notice;

  // The button is always on screen: it sits in its header slot, and docks at the top of the window
  // when the slot scrolls away or a dialog opens (left of a slide-over such as Accessibility
  // settings). Button and panel live in the top layer (popover), raised whenever a dialog opens,
  // so nothing covers them. Placed every frame: labels change width and the header can rewrap.
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    const slot = slotRef.current;
    const btn = btnRef.current;
    if (!POPOVER || !dock || !slot || !btn) return;
    const raise = (el: HTMLElement | null) => {
      if (!el) return;
      try {
        if (el.matches(":popover-open")) el.hidePopover();
        el.showPopover();
      } catch {
        /* not supported: shown in place */
      }
    };
    const raiseAll = () => {
      raise(dock);
      raise(panelRef.current);
    };
    raiseAll();
    const size = new ResizeObserver(() => {
      slot.style.width = `${btn.offsetWidth}px`;
      slot.style.height = `${btn.offsetHeight}px`;
    });
    size.observe(btn);

    let raf = 0;
    const set = (el: HTMLElement, prop: "top" | "left" | "right", v: string) => {
      if (el.style[prop] !== v) el.style[prop] = v;
    };
    const place = () => {
      const vw = window.innerWidth;
      const s = slot.getBoundingClientRect();
      const modal = document.querySelector("dialog[open]");
      const docked = !!modal || s.top < 0 || s.bottom > window.innerHeight || !s.width;
      dock.dataset.docked = String(docked);
      if (docked) {
        // Stay clear of a dialog that covers the right edge (the settings slide-over).
        const d = modal?.getBoundingClientRect();
        const right = d && d.right >= vw - 2 && d.left > vw * 0.3 ? vw - d.left + 12 : 16;
        set(dock, "top", "12px");
        set(dock, "left", `${Math.max(8, vw - right - btn.offsetWidth)}px`);
      } else {
        set(dock, "top", `${s.top}px`);
        set(dock, "left", `${s.left}px`);
      }
      const panel = panelRef.current;
      if (panel) {
        const b = btn.getBoundingClientRect();
        set(panel, "top", `${Math.max(8, b.bottom + 10)}px`);
        set(panel, "right", `${Math.max(8, vw - b.right)}px`);
      }
      raf = requestAnimationFrame(place);
    };
    place();
    const mo = new MutationObserver((recs) => {
      if (recs.some((r) => r.target instanceof HTMLDialogElement && r.target.open)) raiseAll();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => {
      mo.disconnect();
      size.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  // A newly shown panel goes on top of everything, including the button's dock.
  useEffect(() => {
    const panel = panelRef.current;
    if (!showPanel || !panel || !POPOVER) return;
    try {
      if (!panel.matches(":popover-open")) panel.showPopover();
    } catch {
      /* not supported: shown in place */
    }
  }, [showPanel]);
  const notice = v.notice || (v.status === "listening" && v.muted ? COPY.voice.mutedNotice : "");

  return (
    <div className="voice-wrap" data-active={on}>
      {POPOVER && <span ref={slotRef} className="voice-slot" aria-hidden="true" />}
      <div ref={dockRef} popover={POPOVER ? "manual" : undefined} className="voice-dock">
        <button
          type="button"
          ref={btnRef}
          className="btn btn-secondary voice-btn"
          data-state={v.status}
          data-heard={heard}
          data-testid="voice-button"
          aria-pressed={on}
          aria-describedby={descId}
          aria-keyshortcuts={[
            combo.ctrl && "Control",
            combo.alt && "Alt",
            combo.shift && "Shift",
            combo.meta && "Meta",
            combo.code.replace(/^(Key|Digit)/, ""),
          ]
            .filter(Boolean)
            .join("+")}
          onClick={v.toggle}
        >
          <Icon name="mic" />
          {label}
          <kbd className="kbd">{shortcut}</kbd>
        </button>
      </div>
      <span id={descId} className="sr-only">
        {COPY.voice.shortcut(shortcut)} {COPY.voice.privacy}
      </span>
      {showPanel && (
        <div
          ref={panelRef}
          popover="manual"
          className="voice-panel"
          data-fading={!on && !v.notice}
          role="region"
          aria-label={COPY.voice.button}
        >
          <p ref={heardRef} className="voice-heard" data-testid="voice-transcript" data-final={v.final} aria-hidden="true">
            {v.transcript && (on || linger) ? <>“{v.transcript}”</> : heard ? <span className="muted">{COPY.voice.sayHint}</span> : null}
          </p>
          {intent && (
            <p className="voice-intent" data-testid="voice-intent">
              → {intent}
            </p>
          )}
          {notice && (
            <p className="small muted" style={{ margin: 0 }} data-testid="voice-message">
              {notice}
            </p>
          )}
          {on && (
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="voice-meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${heard ? v.level : 0})` }} />
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={v.stop}>
                <Icon name="x" size={16} />
                Stop
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
