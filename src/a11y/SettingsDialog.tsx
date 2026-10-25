import { useEffect, useId, useRef, useState } from "react";
import { usePrefs } from "./prefs";
import { Icon } from "../components/Icon";
import { useVoiceActions } from "../voice/intent/actions";
import { setVoiceSettings, useVoiceSettings, type Guidance } from "../voice/agent/settings";
import type { InterfacePrefs } from "../../shared/types";
import {
  comboConflict, comboFromEvent, comboProblem, DEFAULT_VOICE_KEY, formatCombo, isModifierCode, setCapturing, setVoiceKey, useVoiceKey,
} from "../voice/hotkey";

const FONT_LABELS: Record<InterfacePrefs["font"], string> = {
  system: "System sans-serif (default)",
  atkinson: "Atkinson Hyperlegible",
  opendyslexic: "OpenDyslexic",
};
const FONT_FAMILY: Record<InterfacePrefs["font"], string> = {
  system: "var(--font-system)",
  atkinson: "'Atkinson Hyperlegible', var(--font-system)",
  opendyslexic: "'OpenDyslexic', var(--font-system)",
};

// Accessibility settings: a slide-over dialog usable before login. Native <dialog> gives
// focus containment and Esc to close; focus returns to the opener.
export function SettingsDialog() {
  const { prefs, update, reset, settingsOpen, closeSettings } = usePrefs();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (settingsOpen && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!settingsOpen && d.open) {
      d.close();
    }
  }, [settingsOpen]);

  // Voice, from any page: change the text size without opening the settings.
  const step = (dir: 1 | -1) => update({ textScale: Math.round(Math.min(2, Math.max(1, prefs.textScale + dir * 0.1)) * 10) / 10 });
  useVoiceActions([
    { names: ["Make the text bigger", "bigger text", "larger text", "increase the text size", "zoom in"], run: () => step(1),
      message: () => `Text size ${Math.round(Math.min(2, prefs.textScale + 0.1) * 100)}%.`, when: () => prefs.textScale < 2 },
    { names: ["Make the text smaller", "smaller text", "decrease the text size", "zoom out"], run: () => step(-1),
      message: () => `Text size ${Math.round(Math.max(1, prefs.textScale - 0.1) * 100)}%.`, when: () => prefs.textScale > 1 },
  ]);

  const onClose = () => {
    closeSettings();
    (opener.current as HTMLElement | null)?.focus?.();
  };

  const slider = (key: "textScale" | "lineHeight" | "letterSpacing" | "wordSpacing", label: string, min: number, max: number, step: number, fmt: (n: number) => string) => {
    const id = `set-${key}`;
    return (
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label htmlFor={id} className="label">{label}</label>
          <span style={{ fontWeight: 700 }} aria-hidden="true">{fmt(prefs[key])}</span>
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={prefs[key]}
          aria-valuetext={fmt(prefs[key])}
          onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<InterfacePrefs>)}
          style={{ width: "100%", accentColor: "var(--accent)", height: 28 }}
        />
      </div>
    );
  };

  return (
    <dialog ref={ref} className="slide-over" aria-labelledby={titleId} data-voice-opener="open-settings" onClose={onClose} onCancel={onClose}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: "1.3rem" }}>Accessibility settings</h2>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            <Icon name="x" />Close
          </button>
        </div>
        <div className="stack" style={{ padding: "20px 24px", gap: 22, flex: 1 }}>
          <p className="hint">Changes apply right away. Saved on this device, and to your profile when you log in.</p>

          <div className="panel" style={{ padding: 16, background: "var(--ground)" }}>
            <p className="tag" style={{ margin: "0 0 4px" }}>Preview</p>
            <p style={{ margin: 0 }}>Full Stack Developer at a remote-first team. Core hours are 11am–3pm.</p>
          </div>

          <fieldset>
            <legend>Font</legend>
            <div className="stack" style={{ gap: 8 }}>
              {(Object.keys(FONT_LABELS) as InterfacePrefs["font"][]).map((f) => (
                <label key={f} className="check" style={{ alignItems: "center", padding: "8px 14px" }}>
                  <input type="radio" name="font" checked={prefs.font === f} onChange={() => update({ font: f })} />
                  <span style={{ fontFamily: FONT_FAMILY[f] }}>{FONT_LABELS[f]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {slider("textScale", "Text size", 1, 2, 0.1, (n) => `${Math.round(n * 100)}%`)}
          {slider("lineHeight", "Line spacing", 1.2, 2.4, 0.1, (n) => n.toFixed(1))}
          {slider("letterSpacing", "Letter spacing", 0, 0.12, 0.01, (n) => `${n.toFixed(2)}em`)}
          {slider("wordSpacing", "Word spacing", 0, 0.16, 0.02, (n) => `${n.toFixed(2)}em`)}

          <fieldset>
            <legend>Contrast</legend>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              {(["standard", "high"] as const).map((c) => (
                <label key={c} className="check" style={{ flex: 1, alignItems: "center", padding: "8px 14px" }}>
                  <input type="radio" name="contrast" checked={prefs.contrast === c} onChange={() => update({ contrast: c })} />
                  {c === "standard" ? "Standard" : "High"}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <legend style={{ paddingTop: 8 }}>Reading and voice</legend>
            <Toggle label="Read aloud with word highlighting" checked={prefs.ttsHighlight} onChange={(v) => update({ ttsHighlight: v })} />
            <Toggle label="Voice control (hold to talk)" checked={prefs.voiceNav} onChange={(v) => update({ voiceNav: v })} />
            <Toggle label="Reduce motion" checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
          </fieldset>

          <VoiceShortcutSettings />
          <VoiceAssistantSettings />
        </div>
        <div className="row" style={{ justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-secondary" type="button" onClick={reset} data-voice-names="reset settings|reset to defaults">Reset to default</button>
          <button className="btn btn-primary" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ justifyContent: "space-between", minHeight: 48, flexWrap: "nowrap" }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--accent)" }} />
    </label>
  );
}

// "Hold to talk" shortcut: record a new combo, pick hold or toggle, reset. Saved on this device.
function VoiceShortcutSettings() {
  const { combo, mode } = useVoiceKey();
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState("");
  const changeRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const statusId = useId();
  const conflict = comboConflict(combo);
  const isDefault = formatCombo(combo) === formatCombo(DEFAULT_VOICE_KEY.combo) && mode === DEFAULT_VOICE_KEY.mode;

  const stopRecording = () => {
    setRecording(false);
    setCapturing(false);
  };
  useEffect(() => () => setCapturing(false), []);

  return (
    <fieldset style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <legend style={{ paddingTop: 8 }}>Hold to talk</legend>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span>
            Keyboard shortcut: <kbd className="kbd" style={{ fontSize: "0.9rem" }}>{formatCombo(combo)}</kbd>
          </span>
          <button
            ref={changeRef}
            className="btn btn-secondary btn-sm"
            type="button"
            aria-describedby={`${hintId} ${statusId}`}
            onClick={() => {
              setProblem("");
              setRecording(true);
              setCapturing(true);
            }}
            onBlur={() => recording && stopRecording()}
            onKeyDown={(e) => {
              if (!recording) return;
              // Swallow every key while recording, including Esc, so the dialog stays open.
              e.preventDefault();
              e.stopPropagation();
              if (isModifierCode(e.code)) return;
              if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
                stopRecording();
                return;
              }
              const next = comboFromEvent(e);
              const why = comboProblem(next);
              if (why) {
                setProblem(why);
                return;
              }
              setVoiceKey({ combo: next, mode });
              setProblem("");
              stopRecording();
            }}
            style={recording ? { borderColor: "var(--ink)", background: "var(--verified-bg)" } : undefined}
          >
            {recording ? "Press your keys… (Esc to cancel)" : "Change"}
          </button>
        </div>
        <p id={hintId} className="hint">Use Ctrl, Alt (Option) or Cmd with another key, or a function key, so it never fires while you type.</p>
        <div id={statusId} role="status">
          {problem && <p className="field-error" style={{ margin: 0 }}><Icon name="alert" size={18} />{problem}</p>}
          {!problem && conflict && (
            <div className="callout callout-warn small"><Icon name="alert" size={18} /><span>{conflict}. It may not reach this page. Choose another shortcut if it does not work.</span></div>
          )}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {([["hold", "Hold the keys while you talk"], ["toggle", "Press once to start, press again to stop"]] as const).map(([m, label]) => (
            <label key={m} className="check" style={{ alignItems: "center", padding: "8px 14px" }}>
              <input type="radio" name="talk-mode" checked={mode === m} onChange={() => setVoiceKey({ combo, mode: m })} />
              {label}
            </label>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" type="button" disabled={isDefault} style={{ alignSelf: "flex-start" }}
          onClick={() => { setVoiceKey(DEFAULT_VOICE_KEY); setProblem(""); changeRef.current?.focus(); }}>
          Reset shortcut to {formatCombo(DEFAULT_VOICE_KEY.combo)}, hold
        </button>
      </div>
    </fieldset>
  );
}

// The voice assistant: whether it speaks, how much it says, and (for development) whether it is
// used at all. Saved on this device.
const GUIDANCE: [Guidance, string, string][] = [
  ["brief", "Short confirmations", "\"Saved.\""],
  ["suggest", "Confirmations and a suggestion", "\"Saved. Want to request accommodations?\""],
  ["full", "Full orientation", "Where you are, what is selected and what you can do next. For when you cannot see the page."],
];

function VoiceAssistantSettings() {
  const v = useVoiceSettings();
  return (
    <fieldset style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }} data-voice-names="voice assistant|assistant settings">
      <legend style={{ paddingTop: 8 }}>Voice assistant</legend>
      <Toggle label="Speak replies aloud" checked={v.speak} onChange={(speak) => setVoiceSettings({ speak })} />
      <fieldset>
        <legend className="label">How much the assistant says</legend>
        <div className="stack" style={{ gap: 8 }}>
          {GUIDANCE.map(([g, label, hint]) => (
            <label key={g} className="check" style={{ alignItems: "flex-start", padding: "8px 14px" }}>
              <input type="radio" name="voice-guidance" checked={v.guidance === g} onChange={() => setVoiceSettings({ guidance: g })} />
              <span>
                {label}
                <span className="small muted" style={{ display: "block" }}>{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Toggle label="Developer: use the AI assistant (off: keyword matching only)" checked={v.agent} onChange={(agent) => setVoiceSettings({ agent })} />
    </fieldset>
  );
}
