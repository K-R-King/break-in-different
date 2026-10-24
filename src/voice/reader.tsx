import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAnnounce } from "../a11y/Announcer";
import { COPY } from "../copy";

type Word = { word: string; start: number; end: number };

interface ReaderState {
  jobId: string | null;
  words: string[];
  index: number;
  status: "idle" | "loading" | "playing" | "paused";
  mode: "cartesia" | "browser" | null;
  notice: string;
}

interface ReaderCtx extends ReaderState {
  play: (jobId: Id<"jobs">, section: "summary" | "full", fallbackText: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const IDLE: ReaderState = { jobId: null, words: [], index: -1, status: "idle", mode: null, notice: "" };
const Ctx = createContext<ReaderCtx | null>(null);

// One read-aloud player for the whole app: Cartesia audio with word timestamps, falling back to
// the browser's speech synthesis with boundary-based highlighting. Esc stops; nothing autoplays.
export function ReaderProvider({ children }: { children: ReactNode }) {
  const synthesize = useAction(api.tts.synthesize);
  const announce = useAnnounce();
  const [state, setState] = useState<ReaderState>(IDLE);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timings = useRef<Word[]>([]);
  const raf = useRef<number | undefined>(undefined);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    if (raf.current) cancelAnimationFrame(raf.current);
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setState(IDLE);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.status !== "idle") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, stop]);

  useEffect(() => () => stop(), [stop]);

  const playBrowser = useCallback(
    (jobId: string, text: string, my: number, notice: string) => {
      if (typeof speechSynthesis === "undefined") {
        setState({ ...IDLE, notice: "Read aloud is not available in this browser." });
        return;
      }
      const words = text.split(/\s+/).filter(Boolean);
      const starts: number[] = [];
      let pos = 0;
      for (const w of words) {
        pos = text.indexOf(w, pos);
        starts.push(pos);
        pos += w.length;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.onboundary = (e) => {
        if (token.current !== my) return;
        let i = starts.findIndex((s, k) => e.charIndex >= s && (k === starts.length - 1 || e.charIndex < starts[k + 1]));
        if (i < 0) i = 0;
        setState((s) => ({ ...s, index: i }));
      };
      u.onend = () => token.current === my && setState(IDLE);
      setState({ jobId, words, index: 0, status: "playing", mode: "browser", notice });
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },
    [],
  );

  const play = useCallback(
    async (jobId: Id<"jobs">, section: "summary" | "full", fallbackText: string) => {
      stop();
      const my = ++token.current;
      setState({ ...IDLE, jobId, status: "loading" });
      try {
        const res = await synthesize({ jobId, section });
        if (token.current !== my) return;
        timings.current = res.words;
        const a = new Audio(res.audioUrl);
        audio.current = a;
        const tick = () => {
          if (token.current !== my || !audio.current) return;
          const t = a.currentTime;
          const i = timings.current.findIndex((w) => t >= w.start && t < w.end);
          if (i >= 0) setState((s) => (s.index === i ? s : { ...s, index: i }));
          raf.current = requestAnimationFrame(tick);
        };
        a.onended = () => token.current === my && setState(IDLE);
        await a.play();
        setState({ jobId, words: res.words.map((w) => w.word), index: 0, status: "playing", mode: "cartesia", notice: "" });
        announce(COPY.tts.reading);
        raf.current = requestAnimationFrame(tick);
      } catch {
        if (token.current !== my) return;
        announce(COPY.tts.browserVoice);
        playBrowser(jobId, fallbackText.slice(0, 1500), my, COPY.tts.browserVoice);
      }
    },
    [announce, playBrowser, stop, synthesize],
  );

  const pause = useCallback(() => {
    if (state.mode === "cartesia") audio.current?.pause();
    else speechSynthesis.pause();
    setState((s) => ({ ...s, status: "paused" }));
  }, [state.mode]);

  const resume = useCallback(() => {
    if (state.mode === "cartesia") void audio.current?.play();
    else speechSynthesis.resume();
    setState((s) => ({ ...s, status: "playing" }));
  }, [state.mode]);

  return <Ctx.Provider value={{ ...state, play, pause, resume, stop }}>{children}</Ctx.Provider>;
}

export function useReader(): ReaderCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useReader outside ReaderProvider");
  return c;
}

// Renders the words being read, marking the current word with background + underline.
// Hidden from screen readers (they use their own voice); the source text stays in the page.
export function HighlightedText({ words, index }: { words: string[]; index: number }) {
  return (
    <p aria-hidden="true" style={{ margin: 0, lineHeight: "calc(var(--line-height) + 0.2)" }} data-testid="tts-text">
      {words.map((w, i) => (
        <span key={i}>
          <span className={i === index ? "hl" : undefined}>{w}</span>{" "}
        </span>
      ))}
    </p>
  );
}
