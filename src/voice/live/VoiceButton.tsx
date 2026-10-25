import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { COPY } from "../../copy";
import { formatCombo, isCapturing, isModifierCode, matchesCombo, useVoiceKey } from "../hotkey";
import { useLiveVoice } from "./LiveVoice";
import { useVoicePanel } from "../intent/VoiceIntent";
import "./voice.css";

// Top-layer support (all current browsers); without it the button simply stays in the header.
const POPOVER = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

const LINGER_MS = 12000;
// Every label the button can show (they share one space; see .voice-label).
const LABELS = [COPY.voice.button, COPY.voice.stopListening, COPY.voice.connecting, COPY.voice.reconnecting, COPY.voice.muted]; // the last line heard stays under the button this long after listening ends

// The voice control button: green glow while the microphone is really being heard; the glow fades
// out when listening ends. Under it, two rows: what the person is saying (or a prompt to start),
// and the assistant's reply (or a shimmering "Listening…" / "Thinking…"). Both reset when the
// person speaks again.
// The shortcut is the one set in Accessibility settings (default Cmd+/ on a Mac, Ctrl+/ elsewhere): in "hold" mode, talk
// while holding it; in "toggle" mode, press once to start and again to stop. Enter or Space on the
// focused button also toggles it.
export function VoiceButton() {
  const v = useLiveVoice();
  const replyRef = useRef<HTMLParagraphElement>(null);
  const panel = useVoicePanel();
  const { combo, mode } = useVoiceKey();
  const descId = useId();
  const on = v.status !== "off";
  const heard = v.status === "listening" && !v.muted;
  const shortcut = formatCombo(combo);

  // While on, the button says what a click does (stop); the panel shows that it is listening.
  const label =
    v.status === "starting"
      ? COPY.voice.connecting
      : v.status === "reconnecting"
        ? COPY.voice.reconnecting
        : v.status === "listening"
          ? v.muted
            ? COPY.voice.muted
            : COPY.voice.stopListening
          : COPY.voice.button;
  const hint = on ? COPY.voice.clickToStop(shortcut) : COPY.voice.clickToStart(shortcut);

  // Keep the last words visible for a moment after listening ends.
  const [linger, setLinger] = useState(false);
  const lastWords = v.heard || panel.reply;
  useEffect(() => {
    if (on || !lastWords) return setLinger(false);
    setLinger(true);
    const t = window.setTimeout(() => setLinger(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [on, lastWords]);

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
      v.speaker.unlock();
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

  // A long reply scrolls inside the panel; keep the newest words in view.
  useEffect(() => {
    const el = replyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [panel.reply]);

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
          data-on={on}
          title={hint}
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
          <Icon name={on ? "stop" : "mic"} filled={on} size={20} />
          {/* Every label sits in the same grid cell, so the button keeps the width of the longest
              one and never changes size as it toggles. Hidden labels are not read out. */}
          <span className="voice-label">
            {LABELS.map((l) => (
              <span key={l} data-shown={l === label} aria-hidden={l !== label}>
                {l}
              </span>
            ))}
          </span>
          <kbd className="kbd">{shortcut}</kbd>
        </button>
      </div>
      <span id={descId} className="sr-only">
        {hint} {COPY.voice.privacy}
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
          {/* Row 1: what they are saying now, or a prompt to start. */}
          <p className="voice-said" data-testid="voice-transcript" data-final={v.final} aria-hidden="true">
            {v.heard ? v.heard : heard ? <span className="voice-hint">{COPY.voice.startTalking}</span> : null}
          </p>
          {/* Row 2: the assistant's reply, or that it is listening or thinking. Screen readers hear
              replies through the announcer, so this is visual only. */}
          <p ref={replyRef} className="voice-reply" data-testid="voice-reply" aria-hidden="true">
            {notice ? (
              notice
            ) : panel.phase === "thinking" || (panel.phase === "listening" && heard && !panel.reply) ? (
              <span className="voice-shimmer" data-testid="voice-phase">
                {panel.phase === "thinking" ? COPY.voice.thinking : COPY.voice.listening}
              </span>
            ) : (
              panel.reply
            )}
          </p>
        </div>
      )}
    </div>
  );
}
