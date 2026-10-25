import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { COPY } from "../copy";
import { PageHeading, useDocumentTitle } from "../a11y/PageHeading";
import { useAnnounce } from "../a11y/Announcer";
import { Icon } from "../components/Icon";
import { toAppError } from "../lib/errors";
import { useVoice } from "../voice/VoiceProvider";
import { PushToTalkRecorder } from "../voice/recorder";
import { HighlightedText } from "../voice/reader";

type Style = "conversation" | "written";
type Word = { word: string; start: number; end: number };
type Line = {
  role: "interviewer" | "candidate";
  text: string;
  audio?: { url: string; words: Word[] } | null;
  kind?: "question" | "followup" | "closing";
  source?: "claude" | "script";
};
type Feedback = { items: { question: string; worked: string; tryNext: string }[]; overall: string; source: "claude" | "none" };

// Practice interview: Claude asks, Cartesia speaks, the candidate answers by voice or typing.
// The conversation lives only in this page's state; nothing is saved.
export default function PracticePage() {
  const { id } = useParams();
  const jobId = id as Id<"jobs">;
  const job = useQuery(api.jobs.get, { jobId });
  const profile = useQuery(api.profiles.get);
  const turnAction = useAction(api.ai.practice.turn);
  const planAction = useAction(api.ai.practice.plan);
  const feedbackAction = useAction(api.ai.practice.feedback);
  const announce = useAnnounce();
  const speaker = useSpeaker();
  useDocumentTitle(COPY.practice.title);

  const [style, setStyle] = useState<Style>("conversation");
  const [styleFromProfile, setStyleFromProfile] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [advance, setAdvance] = useState(false);
  const [plan, setPlan] = useState<string[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const init = useRef(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);

  // Written questions by default when the profile asks for written alternatives.
  useEffect(() => {
    if (init.current || profile === undefined) return;
    init.current = true;
    if (profile?.requiredAccommodations.includes("written_alternatives")) {
      setStyle("written");
      setStyleFromProfile(true);
    }
  }, [profile]);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const last = lines[lines.length - 1];
  const started = lines.length > 0;
  const done = last?.kind === "closing";
  const answered = lines.filter((l) => l.role === "candidate").length;
  const lastQuestionIndex = lines.map((l) => l.role).lastIndexOf("interviewer");
  // The notice is about the latest interviewer line only; the next turn may come from Claude again.
  const scripted = lines[lastQuestionIndex]?.source === "script";
  // Written questions always show text; a spoken conversation can be practiced by listening only.
  const textVisible = style === "written" || showTranscript;

  const transcriptToggle = style === "conversation" && (
    <div className="field">
      <label className="ck">
        <input type="checkbox" checked={showTranscript} aria-describedby="transcript-hint" onChange={(e) => setShowTranscript(e.target.checked)} data-voice-names="transcript|show the text|show transcript" />
        <span>{COPY.practice.showTranscript}</span>
      </label>
      <p id="transcript-hint" className="hint">{COPY.practice.showTranscriptHint}</p>
    </div>
  );

  const ask = async (move: "start" | "answer" | "rephrase", history: Line[]) => {
    setBusy(true);
    setError("");
    setPaused(false);
    announce(COPY.practice.thinking);
    try {
      const r = await turnAction({ jobId, style, move, history: history.map(({ role, text }) => ({ role, text })), plan: plan ?? undefined });
      const line: Line = { role: "interviewer", text: r.text, audio: r.audio, kind: r.kind, source: r.source };
      const next = [...history, line];
      setLines(next);
      if (style === "conversation") {
        announce(COPY.practice.speaking);
        void speaker.play(next.length - 1, line);
      } else {
        announce(`Interviewer: ${r.text}`);
        answerRef.current?.focus();
      }
      if (r.kind === "closing") announce(COPY.practice.finished);
    } catch (e) {
      const a = toAppError(e);
      setError(a.message);
      announce(a.message, "assertive");
    } finally {
      setBusy(false);
    }
  };

  const loadPlan = async () => {
    setBusy(true);
    setError("");
    announce(COPY.practice.planning);
    try {
      const r = await planAction({ jobId });
      setPlan(r.questions);
      announce(`${r.questions.length} questions ready. Take your time to read them.`);
    } catch (e) {
      const a = toAppError(e);
      setError(a.message);
      announce(a.message, "assertive");
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || done) return;
    speaker.stop();
    const history: Line[] = [...lines, { role: "candidate", text: t }];
    setLines(history);
    setAnswer("");
    void ask("answer", history);
  };

  const needMoment = () => {
    speaker.stop();
    setPaused(true);
    announce(COPY.practice.moment);
  };

  const getFeedback = async () => {
    speaker.stop();
    setFeedbackBusy(true);
    setError("");
    announce("Preparing feedback");
    try {
      setFeedback(await feedbackAction({ jobId, history: lines.map(({ role, text }) => ({ role, text })) }));
    } catch (e) {
      const a = toAppError(e);
      setError(a.message);
      announce(a.message, "assertive");
    } finally {
      setFeedbackBusy(false);
    }
  };

  const startOver = () => {
    speaker.stop();
    setLines([]);
    setAnswer("");
    setFeedback(null);
    setPlan(null);
    setPaused(false);
    setError("");
    announce("Practice cleared.");
  };

  if (job === undefined) return <main id="main" className="container" style={{ paddingBlock: 40 }} role="status">Loading…</main>;

  const status = busy
    ? COPY.practice.thinking
    : speaker.index >= 0
      ? speaker.mode === "browser" ? `${COPY.tts.browserVoice} · press Esc to stop` : COPY.practice.speaking
      : paused ? COPY.practice.moment : done ? COPY.practice.finished : "";

  return (
    <main id="main" className="container stack" style={{ paddingBlock: "32px 56px", gap: 24, maxWidth: 860 }}>
      <div className="stack" style={{ gap: 8 }}>
        <Link to="/jobs" style={{ fontWeight: 600, alignSelf: "flex-start" }}>Back to jobs</Link>
        <PageHeading>{COPY.practice.title}</PageHeading>
        <p style={{ margin: 0, fontSize: "1.12rem" }}>
          {job.title} · {job.employer?.name} {job.isDemo && <span className="demo" style={{ verticalAlign: "middle" }}>DEMO</span>}
        </p>
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
          {last?.role === "candidate" && !busy && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void ask("answer", lines)}>{COPY.common.retry}</button>
          )}
        </div>
      )}

      {!started ? (
        <section className="card stack" aria-labelledby="setup-h" data-voice-names="setup|practice setup">
          <h2 id="setup-h" style={{ margin: 0, fontSize: "1.3rem" }}>Before you start</h2>
          <p style={{ margin: 0 }}>{COPY.practice.lede}</p>
          <fieldset>
            <legend style={{ fontWeight: 700 }}>How should questions come?</legend>
            {styleFromProfile && <p className="hint">{COPY.practice.styleFromProfile}</p>}
            {(["conversation", "written"] as const).map((s) => (
              <label key={s} className="ck">
                <input type="radio" name="style" checked={style === s} onChange={() => setStyle(s)}
                  data-voice-names={s === "conversation" ? "spoken|out loud|by voice|talking" : "written|in writing|typed|typing"} />
                <span>
                  {s === "conversation" ? COPY.practice.styleConversation : COPY.practice.styleWritten}
                  <span className="muted"> ({s === "conversation" ? COPY.practice.styleConversationHint : COPY.practice.styleWrittenHint})</span>
                </span>
              </label>
            ))}
          </fieldset>
          {transcriptToggle}
          <div className="field">
            <label className="ck">
              <input type="checkbox" checked={advance} aria-describedby="advance-hint" onChange={(e) => { setAdvance(e.target.checked); if (!e.target.checked) setPlan(null); }}
                data-voice-names="questions in advance|see the questions first|preview the questions" />
              <span>{COPY.practice.advance}</span>
            </label>
            <p id="advance-hint" className="hint">{COPY.practice.advanceHint}</p>
          </div>
          <div className="callout callout-warn"><Icon name="info" size={22} /><p className="small" style={{ margin: 0 }}>{COPY.practice.privacy}</p></div>
          <p className="hint">{COPY.practice.noTimer}</p>
          {plan ? (
            <>
              <PlanList plan={plan} />
              <button className="btn btn-primary btn-lg" type="button" disabled={busy} onClick={() => void ask("start", [])} style={{ alignSelf: "flex-start", minHeight: 52 }}
                data-voice-command data-voice-names="start|begin|I'm ready|start the interview|let's start">
                {busy ? COPY.practice.thinking : COPY.practice.ready}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" type="button" disabled={busy} onClick={() => void (advance ? loadPlan() : ask("start", []))} style={{ alignSelf: "flex-start", minHeight: 52 }}
              data-voice-command data-voice-names="start|begin|start the interview|let's start|start practicing">
              {busy ? (advance ? COPY.practice.planning : COPY.practice.thinking) : "Start practice"}
            </button>
          )}
        </section>
      ) : (
        <section className="card stack" aria-labelledby="conv-h" data-voice-names="the conversation|the interview" data-voice-primary>
          <h2 id="conv-h" style={{ margin: 0, fontSize: "1.3rem" }}>Conversation</h2>
          {scripted && <div className="callout callout-warn"><Icon name="info" /><span>{COPY.practice.scripted}</span></div>}
          {transcriptToggle}
          {plan && (
            <details open className="panel" style={{ padding: "12px 16px" }}>
              <summary style={{ fontWeight: 700, cursor: "pointer" }} data-voice-command data-voice-names="the questions|planned questions|question list">{COPY.practice.planTitle} ({plan.length})</summary>
              <PlanList plan={plan} bare />
            </details>
          )}
          {!textVisible && <p className="panel" style={{ margin: 0, padding: "12px 16px", background: "var(--ground)" }}>{COPY.practice.transcriptHidden}</p>}
          {textVisible && <ol aria-label="Conversation" className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 12 }}>
            {lines.map((l, i) => (
              <li key={i} className="panel stack" style={{ padding: "12px 16px", gap: 6, background: l.role === "interviewer" ? "var(--ground)" : undefined }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{l.role === "interviewer" ? "Interviewer" : "You"}</p>
                {speaker.index === i && speaker.words.length > 0 ? (
                  <>
                    <HighlightedText words={speaker.words} index={speaker.word} />
                    <p className="sr-only">{l.text}</p>
                  </>
                ) : (
                  <p style={{ margin: 0 }}>{l.text}</p>
                )}
                {l.role === "interviewer" && (
                  <button className="btn btn-ghost btn-sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => void speaker.play(i, l)} data-voice-command>
                    <Icon name="volume" size={18} />Play<span className="sr-only"> what the interviewer said</span>
                  </button>
                )}
              </li>
            ))}
          </ol>}
          <p role="status" className="small" style={{ margin: 0, fontWeight: 600, minHeight: "1.5em" }}>{status}</p>

          {!done && (
            <div className="stack" style={{ gap: 12 }}>
              <div className="field">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                  <label htmlFor="answer" className="label">Your answer</label>
                  <HoldToAnswer
                    disabled={busy || last?.role !== "interviewer"}
                    onStart={() => speaker.stop()}
                    onText={(t) => {
                      if (autoSend) send(`${answer} ${t}`);
                      else {
                        setAnswer((a) => `${a}${a && !a.endsWith(" ") ? " " : ""}${t}`);
                        answerRef.current?.focus();
                      }
                    }}
                  />
                </div>
                <p id="answer-hint" className="hint">{COPY.practice.noTimer} Press Ctrl+Enter to send.</p>
                <textarea
                  id="answer" ref={answerRef} className="input" rows={5} maxLength={2000} value={answer} aria-describedby="answer-hint" data-voice-names="my answer|answer box|answer"
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(answer); } }}
                />
              </div>
              <div className="field">
                <label className="ck">
                  <input type="checkbox" checked={autoSend} aria-describedby="autosend-hint" onChange={(e) => setAutoSend(e.target.checked)} data-voice-names="send automatically|auto send" />
                  <span>{COPY.practice.autoSend}</span>
                </label>
                <p id="autosend-hint" className="hint">{COPY.practice.autoSendHint}</p>
              </div>
              <div className="row">
                <button className="btn btn-primary" type="button" disabled={busy || !answer.trim() || last?.role !== "interviewer"} onClick={() => send(answer)}
                  data-voice-command data-voice-names="send|send it|send my answer|submit my answer">Send answer</button>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={needMoment} data-voice-command data-voice-names="give me a moment|one moment|hold on|let me think">I need a moment</button>
                <button className="btn btn-secondary" type="button" disabled={lastQuestionIndex < 0} onClick={() => void speaker.play(lastQuestionIndex, lines[lastQuestionIndex])}
                  data-voice-command data-voice-names="repeat the question|say that again|repeat that|what was the question">Repeat</button>
                <button className="btn btn-secondary" type="button" disabled={busy || last?.role !== "interviewer"} onClick={() => { speaker.stop(); void ask("rephrase", lines); }}
                  data-voice-command data-voice-names="rephrase|say it another way|reword it|I don't understand the question">Say it differently</button>
              </div>
            </div>
          )}

          <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <button className={done ? "btn btn-primary" : "btn btn-secondary"} type="button" disabled={feedbackBusy || busy || answered === 0} onClick={() => void getFeedback()}
              data-voice-command data-voice-names="feedback|get feedback|end the interview|I'm done|finish the interview">
              {feedbackBusy ? "Preparing feedback…" : done ? "Get feedback" : "End and get feedback"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={startOver} data-voice-names="restart|restart the practice|reset">Start over</button>
          </div>
          <p className="hint">{COPY.practice.aiNote}</p>
        </section>
      )}

      {feedback && (
        <section className="card stack" aria-labelledby="fb-h">
          <h2 id="fb-h" ref={feedbackRef} tabIndex={-1} style={{ margin: 0, fontSize: "1.3rem" }}>{COPY.practice.feedbackTitle}</h2>
          {feedback.items.length > 0 && (
            <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 12 }}>
              {feedback.items.map((it, i) => (
                <li key={i}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{it.question}</p>
                  <p style={{ margin: "4px 0 0" }}><b>What worked:</b> {it.worked}</p>
                  <p style={{ margin: "4px 0 0" }}><b>Try next:</b> {it.tryNext}</p>
                </li>
              ))}
            </ol>
          )}
          <p style={{ margin: 0 }}>{feedback.overall}</p>
        </section>
      )}
    </main>
  );
}

// The main questions shown in advance, for candidates who chose to see them first.
function PlanList({ plan, bare = false }: { plan: string[]; bare?: boolean }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {!bare && <h3 style={{ margin: 0, fontSize: "1.12rem" }}>{COPY.practice.planTitle}</h3>}
      <ol aria-label={COPY.practice.planTitle} className="stack" style={{ margin: 0, paddingLeft: 22, gap: 8 }}>
        {plan.map((q, i) => <li key={i}>{q}</li>)}
      </ol>
    </div>
  );
}

// Plays one interviewer line: Cartesia audio with word timestamps, or the browser's voice
// with boundary-based highlighting when there is no audio. Esc stops; leaving the page stops.
function useSpeaker() {
  const IDLE = { index: -1, words: [] as string[], word: -1, mode: null as "cartesia" | "browser" | null };
  const [state, setState] = useState(IDLE);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef<number | undefined>(undefined);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    if (raf.current) cancelAnimationFrame(raf.current);
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setState({ index: -1, words: [], word: -1, mode: null });
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);

  const browser = (index: number, text: string, my: number) => {
    if (typeof speechSynthesis === "undefined") return;
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
      const i = starts.findIndex((s, k) => e.charIndex >= s && (k === starts.length - 1 || e.charIndex < starts[k + 1]));
      setState((s) => ({ ...s, word: Math.max(i, 0) }));
    };
    u.onend = () => token.current === my && setState({ index: -1, words: [], word: -1, mode: null });
    setState({ index, words, word: 0, mode: "browser" });
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const play = async (index: number, line: Line) => {
    stop();
    const my = ++token.current;
    if (line.audio) {
      try {
        const timings = line.audio.words;
        const a = new Audio(line.audio.url);
        audio.current = a;
        a.onended = () => token.current === my && setState({ index: -1, words: [], word: -1, mode: null });
        await a.play();
        if (token.current !== my) return;
        setState({ index, words: timings.map((w) => w.word), word: 0, mode: "cartesia" });
        const tick = () => {
          if (token.current !== my || !audio.current) return;
          const t = a.currentTime;
          const i = timings.findIndex((w) => t >= w.start && t < w.end);
          if (i >= 0) setState((s) => (s.word === i ? s : { ...s, word: i }));
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return;
      } catch {
        if (token.current !== my) return;
      }
    }
    browser(index, line.text, my);
  };

  return { ...state, play, stop };
}

// Hold to answer: records while held (pointer, or Space/Enter), then turns the speech into text.
function HoldToAnswer({ onText, onStart, disabled }: { onText: (t: string) => void; onStart: () => void; disabled?: boolean }) {
  const { transcribe, supported } = useVoice();
  const announce = useAnnounce();
  const rec = useRef(new PushToTalkRecorder());
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const held = useRef(false);
  useEffect(() => {
    const r = rec.current;
    return () => void r.stop();
  }, []);
  if (!supported) return null;
  const down = async () => {
    if (held.current || disabled) return;
    held.current = true;
    onStart();
    try {
      await rec.current.start();
      setState("rec");
      announce(COPY.voice.listening);
    } catch {
      held.current = false;
      announce("Microphone access was blocked. You can type your answer instead.");
    }
  };
  const up = async () => {
    if (!held.current) return;
    held.current = false;
    setState("busy");
    const r = await rec.current.stop();
    try {
      if (r) {
        const t = await transcribe(r.audio, r.mimeType);
        if (t) onText(t);
        else announce("We did not catch that. Try again, or type your answer.");
      }
    } catch (e) {
      announce(toAppError(e).message, "assertive");
    } finally {
      setState("idle");
    }
  };
  return (
    // Press-and-hold recording: not something voice control can press (data-voice-ignore).
    <button type="button" className="btn btn-secondary" disabled={disabled} aria-pressed={state === "rec"} title={COPY.voice.privacy} data-voice-ignore
      onPointerDown={(e) => { e.preventDefault(); void down(); }} onPointerUp={() => void up()} onPointerLeave={() => void up()}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void down(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void up(); } }}>
      <Icon name="mic" size={18} />{state === "rec" ? "Listening… let go when you finish" : state === "busy" ? "Working…" : "Hold to answer"}
    </button>
  );
}
