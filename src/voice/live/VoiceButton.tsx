import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { COPY } from "../../copy";
import { formatCombo, isCapturing, isModifierCode, matchesCombo, useVoiceKey } from "../hotkey";
import { useLiveVoice } from "./LiveVoice";
import { useIntentStatus } from "../intent/VoiceIntent";
import "./voice.css";

const LINGER_MS = 5000; // the last line heard stays under the button this long after listening ends

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

  // The panel lives in the top layer (popover) so it stays readable above an open modal dialog
  // such as Accessibility settings, and is raised again whenever a dialog opens.
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    const btn = btnRef.current;
    if (!showPanel || !panel || !btn) return;
    // Follow the button every frame: its label changes width and the header can rewrap.
    let raf = 0;
    const place = () => {
      const r = btn.getBoundingClientRect();
      const top = `${Math.max(8, r.bottom + 10)}px`;
      const right = `${Math.max(16, window.innerWidth - r.right)}px`;
      if (panel.style.top !== top) panel.style.top = top;
      if (panel.style.right !== right) panel.style.right = right;
      raf = requestAnimationFrame(place);
    };
    const raise = () => {
      try {
        if (panel.matches(":popover-open")) panel.hidePopover();
        panel.showPopover();
      } catch {
        /* popover unsupported: the panel still shows in place */
      }
    };
    place();
    raise();
    const mo = new MutationObserver((recs) => {
      if (recs.some((r) => r.target instanceof HTMLDialogElement && r.target.open)) raise();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [showPanel]);
  const notice = v.notice || (v.status === "listening" && v.muted ? COPY.voice.mutedNotice : "");

  return (
    <div className="voice-wrap" data-active={on}>
      <button
        type="button"
        ref={btnRef}
        className="btn btn-secondary voice-btn"
        data-state={v.status}
        data-heard={heard}
        data-testid="voice-button"
        aria-pressed={on}
        aria-describedby={descId}
        aria-keyshortcuts={[combo.ctrl && "Control", combo.alt && "Alt", combo.shift && "Shift", combo.meta && "Meta", combo.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join("+")}
        onClick={v.toggle}
      >
        <Icon name="mic" />
        {label}
        <kbd className="kbd">{shortcut}</kbd>
      </button>
      <span id={descId} className="sr-only">
        {COPY.voice.shortcut(shortcut)} {COPY.voice.privacy}
      </span>
      {showPanel && (
        <div ref={panelRef} popover="manual" className="voice-panel" data-fading={!on && !v.notice} role="region" aria-label={COPY.voice.button}>
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
