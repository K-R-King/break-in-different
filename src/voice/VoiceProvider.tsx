import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAnnounce } from "../a11y/Announcer";
import { COPY } from "../copy";
import { toAppError } from "../lib/errors";
import { COMMAND_HELP, parseCommand, type VoiceCommand } from "./commands";
import { PushToTalkRecorder, recordingSupported } from "./recorder";
import { formatCombo, isCapturing, isModifierCode, matchesCombo, useVoiceKey, type Combo } from "./hotkey";
import { Icon } from "../components/Icon";

type PageHandlers = Partial<Record<Exclude<VoiceCommand["type"], "navigate" | "help" | "scrollDown" | "scrollUp">, () => void>>;

interface VoiceCtx {
  state: "idle" | "listening" | "working";
  message: string;
  supported: boolean;
  start: () => Promise<void>;
  finish: () => Promise<void>;
  register: (handlers: PageHandlers) => () => void;
  transcribe: (audio: ArrayBuffer, mimeType: string) => Promise<string>;
}

const Ctx = createContext<VoiceCtx | null>(null);

// Long transcripts are cut so the message under the button stays short.
const clip = (t: string, max = 80) => (t.length > max ? `${t.slice(0, max).trimEnd()}…` : t);

// Pages with their own scrolling column mark it with data-voice-scroll; otherwise the window scrolls.
function scrollPage(direction: 1 | -1) {
  const el = document.querySelector<HTMLElement>("[data-voice-scroll]");
  if (el && el.scrollHeight > el.clientHeight) el.scrollBy({ top: direction * el.clientHeight * 0.8, behavior: "smooth" });
  else window.scrollBy({ top: direction * window.innerHeight * 0.8, behavior: "smooth" });
}

// Push-to-talk voice navigation. Audio goes to Cartesia speech-to-text through a Convex action.
export function VoiceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const transcribeAction = useAction(api.stt.transcribe);
  const recorder = useRef(new PushToTalkRecorder());
  const handlers = useRef<PageHandlers>({});
  const [state, setState] = useState<VoiceCtx["state"]>("idle");
  const [message, setMessage] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const supported = recordingSupported();

  const transcribe = useCallback(
    async (audio: ArrayBuffer, mimeType: string) => (await transcribeAction({ audio, mimeType })).text,
    [transcribeAction],
  );

  const run = useCallback(
    (cmd: VoiceCommand) => {
      switch (cmd.type) {
        case "navigate":
          navigate(cmd.to);
          return true;
        case "help":
          setHelpOpen(true);
          return true;
        case "scrollDown":
          scrollPage(1);
          return true;
        case "scrollUp":
          scrollPage(-1);
          return true;
        default: {
          const h = handlers.current[cmd.type];
          if (h) h();
          return !!h;
        }
      }
    },
    [navigate],
  );

  const start = useCallback(async () => {
    if (!supported) {
      setMessage(COPY.voice.unsupported);
      announce(COPY.voice.unsupported);
      return;
    }
    if (state !== "idle") return;
    try {
      await recorder.current.start();
      setState("listening");
      setMessage("");
      announce(COPY.voice.listening);
    } catch {
      setMessage("Microphone access was blocked. Allow it in your browser, or use the keyboard.");
      announce("Microphone access was blocked.");
    }
  }, [announce, state, supported]);

  const finish = useCallback(async () => {
    if (state !== "listening") return;
    setState("working");
    const rec = await recorder.current.stop();
    if (!rec) {
      setState("idle");
      setMessage("");
      return;
    }
    try {
      const text = await transcribe(rec.audio, rec.mimeType);
      const cmd = parseCommand(text);
      if (cmd && run(cmd)) {
        setMessage(`Heard "${clip(text)}".`);
        announce(`Heard ${clip(text)}`);
      } else {
        const m = text ? COPY.voice.notUnderstood(clip(text)) : "We did not catch that. Try again.";
        setMessage(m);
        announce(m);
      }
    } catch (e) {
      const m = toAppError(e).message;
      setMessage(m);
      announce(m);
    } finally {
      setState("idle");
    }
  }, [announce, run, state, transcribe]);

  // The message is also announced, so it can clear itself after a while.
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(""), 8000);
    return () => window.clearTimeout(t);
  }, [message]);

  const register = useCallback((h: PageHandlers) => {
    handlers.current = h;
    return () => {
      if (handlers.current === h) handlers.current = {};
    };
  }, []);

  return (
    <Ctx.Provider value={{ state, message, supported, start, finish, register, transcribe }}>
      {children}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Ctx.Provider>
  );
}

export function useVoice(): VoiceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVoice outside VoiceProvider");
  return c;
}

export function useVoiceHandlers(h: PageHandlers) {
  const { register } = useVoice();
  const ref = useRef(h);
  ref.current = h;
  useEffect(
    () =>
      register({
        next: () => ref.current.next?.(),
        previous: () => ref.current.previous?.(),
        open: () => ref.current.open?.(),
        read: () => ref.current.read?.(),
        stop: () => ref.current.stop?.(),
        save: () => ref.current.save?.(),
        apply: () => ref.current.apply?.(),
      }),
    [register],
  );
}

// aria-keyshortcuts uses key names: "Control+Space", "Alt+Shift+K".
function ariaShortcut(c: Combo): string {
  const key = c.code.startsWith("Key") ? c.code.slice(3) : c.code.startsWith("Digit") ? c.code.slice(5) : c.code;
  return [c.ctrl && "Control", c.alt && "Alt", c.shift && "Shift", c.meta && "Meta", key].filter(Boolean).join("+");
}

// Talk by holding the button or the shortcut (default Ctrl+Space), or in toggle mode press once to
// start and again to stop. The shortcut works anywhere on the page because it needs a modifier.
export function PushToTalkButton() {
  const { state, message, start, finish } = useVoice();
  const { combo, mode } = useVoiceKey();
  const descId = useId();
  const held = useRef(false);
  const latest = useRef({ state, start, finish, mode });
  latest.current = { state, start, finish, mode };
  const shortcut = formatCombo(combo);

  const down = useCallback(() => {
    if (held.current) return;
    held.current = true;
    void latest.current.start();
  }, []);
  const up = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    void latest.current.finish();
  }, []);
  const toggle = useCallback(() => {
    if (latest.current.state === "idle") void latest.current.start();
    else if (latest.current.state === "listening") void latest.current.finish();
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (isCapturing() || e.repeat || !matchesCombo(e, combo)) return;
      e.preventDefault();
      if (latest.current.mode === "toggle") toggle();
      else down();
    };
    // Hold mode: letting go of the main key or any of its modifiers sends the recording.
    const onUp = (e: KeyboardEvent) => {
      if (latest.current.mode === "hold" && held.current && (e.code === combo.code || isModifierCode(e.code))) up();
    };
    const onBlur = () => {
      if (latest.current.mode === "hold") up();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [combo, down, up, toggle]);

  const idleLabel = mode === "toggle" ? COPY.voice.press : COPY.voice.hold;
  const labels = [
    { on: state === "idle", text: idleLabel },
    { on: state === "listening", text: mode === "toggle" ? COPY.voice.listeningToggle : COPY.voice.listening },
    { on: state === "working", text: COPY.voice.working },
  ];
  const holdHandlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      down();
    },
    onPointerUp: up,
    onPointerLeave: up,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        down();
      }
    },
    onKeyUp: (e: ReactKeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        up();
      }
    },
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-pressed={state === "listening"}
        aria-describedby={descId}
        aria-keyshortcuts={ariaShortcut(combo)}
        {...(mode === "toggle" ? { onClick: toggle } : holdHandlers)}
        style={state === "listening" ? { borderColor: "var(--ink)", background: "var(--verified-bg)" } : undefined}
      >
        <Icon name="mic" />
        {/* Every label sits in the same grid cell, so the button keeps one width as the state changes. */}
        <span style={{ display: "inline-grid" }}>
          {labels.map((l) => (
            <span key={l.text} aria-hidden={!l.on} style={{ gridArea: "1 / 1", visibility: l.on ? "visible" : "hidden" }}>
              {l.text}
            </span>
          ))}
        </span>
        <kbd className="kbd">{shortcut}</kbd>
      </button>
      <span id={descId} className="sr-only">
        {mode === "toggle" ? `Press ${shortcut} to start and again to stop.` : `Hold ${shortcut} or this button while you talk.`} {COPY.voice.privacy} Say
        "help" to hear the commands.
      </span>
      {message && state === "idle" && (
        <span className="voice-message small" data-testid="voice-message">
          {message}
        </span>
      )}
    </div>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <div className="stack" style={{ padding: 24 }}>
        <h2 id={titleId} style={{ margin: 0 }}>Voice commands</h2>
        <p className="hint">Hold "Hold to talk" or its keyboard shortcut, say a command, then let go. You can change the shortcut, or switch to press once to start and again to stop, in Accessibility settings. {COPY.voice.privacy}</p>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px" }}>
          {COMMAND_HELP.map((c) => (
            <div key={c.say} style={{ display: "contents" }}>
              <dt style={{ fontWeight: 700 }}>"{c.say}"</dt>
              <dd style={{ margin: 0 }}>{c.does}</dd>
            </div>
          ))}
        </dl>
        <button className="btn btn-primary" type="button" onClick={onClose} style={{ alignSelf: "flex-end" }}>
          Close
        </button>
      </div>
    </dialog>
  );
}
