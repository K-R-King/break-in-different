import { useEffect, useId, useRef } from "react";
import { usePrefs } from "./prefs";
import { Icon } from "../components/Icon";
import type { InterfacePrefs } from "../../shared/types";

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
    <dialog ref={ref} className="slide-over" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
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
        </div>
        <div className="row" style={{ justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-secondary" type="button" onClick={reset}>Reset to default</button>
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
