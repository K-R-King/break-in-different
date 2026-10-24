import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAnnounce } from "../a11y/Announcer";
import { COPY } from "../copy";
import { toAppError } from "../lib/errors";
import { COMMAND_HELP, parseCommand, type VoiceCommand } from "./commands";
import { PushToTalkRecorder, recordingSupported } from "./recorder";
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
          window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
          return true;
        case "scrollUp":
          window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "smooth" });
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
      setMessage(COPY.voice.listening);
      announce(COPY.voice.listening);
    } catch {
      setMessage("Microphone access was blocked. Allow it in your browser, or use the keyboard.");
      announce("Microphone access was blocked.");
    }
  }, [announce, state, supported]);

  const finish = useCallback(async () => {
    if (state !== "listening") return;
    setState("working");
    setMessage(COPY.voice.working);
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
        setMessage(`Heard "${text}".`);
        announce(`Heard ${text}`);
      } else {
        const m = text ? COPY.voice.notUnderstood(text) : "We did not catch that. Try again.";
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

// Hold the button (pointer, or Space/Enter on the keyboard) to talk; release to send.
export function PushToTalkButton() {
  const { state, message, start, finish } = useVoice();
  const descId = useId();
  const held = useRef(false);
  const down = () => {
    if (held.current) return;
    held.current = true;
    void start();
  };
  const up = () => {
    if (!held.current) return;
    held.current = false;
    void finish();
  };
  return (
    <div style={{ position: "relative", display: "inline-flex", flexDirection: "column" }}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-pressed={state === "listening"}
        aria-describedby={descId}
        onPointerDown={(e) => {
          e.preventDefault();
          down();
        }}
        onPointerUp={up}
        onPointerLeave={up}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            down();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            up();
          }
        }}
        style={state === "listening" ? { borderColor: "var(--ink)", background: "var(--verified-bg)" } : undefined}
      >
        <Icon name="mic" />
        {state === "listening" ? COPY.voice.listening : state === "working" ? COPY.voice.working : COPY.voice.hold}
      </button>
      <span id={descId} className="sr-only">
        {COPY.voice.privacy} Say "help" to hear the commands.
      </span>
      {message && (
        <span className="small muted" style={{ maxWidth: 260, marginTop: 4 }} data-testid="voice-message">
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
        <p className="hint">Hold "Hold to talk", say a command, then let go. {COPY.voice.privacy}</p>
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
