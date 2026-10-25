// From words to actions with the least delay. Every partial transcript is matched against the
// page (local, synchronous) and the best target is highlighted at once; certain matches act at
// the first sign the person has finished (Cartesia's turn.eager_end, else turn.end). Anything
// uncertain, a question, text to type, or an answer to the assistant's own question goes to the
// voice assistant (src/voice/agent), whose first action line runs the moment it arrives. With the
// assistant off or unavailable, keyword matching asks instead.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAnnounce } from "../../a11y/Announcer";
import { COPY } from "../../copy";
import { useLiveVoice } from "../live/LiveVoice";
import { buildAgentRequest, type AgentTurn } from "../agent/context";
import { streamAgent } from "../agent/client";
import type { AgentLine } from "../agent/protocol";
import { getVoiceSettings } from "../agent/settings";
import { execute, fillText, intentLabel } from "./execute";
import { highlights, HighlightLayer } from "./highlight";
import { afterCorrection, alreadyHere, bestMatch, looseGuess, parse, type Match, type Verb } from "./match";
import { highlightBox, scanCached, type Target } from "./scan";
import { parseScroll, scrollPage } from "./scroll";
import { resolveVerbOnly } from "./resolve";
import { useVoiceActions } from "./actions";

// The line under the transcript: what voice control is about to do, did, or needs.
let status = "";
const statusSubs = new Set<() => void>();
function setStatus(s: string) {
  if (s === status) return;
  status = s;
  statusSubs.forEach((f) => f());
}
export function useIntentStatus(): string {
  return useSyncExternalStore(
    (f) => (statusSubs.add(f), () => statusSubs.delete(f)),
    () => status,
    () => status,
  );
}

const SELECTION_AFTER_STOP_MS = 10_000;
const SUGGESTION_MS = 20_000; // how long "yes" can still confirm a suggestion
const ANSWER_MS = 30_000; // after the assistant asks something, the next words go to it
const AGENT_TIMEOUT_MS = 6_000; // no first line by then: keyword matching takes over
const NO = /^\W*(no|nope|no thanks|never ?mind|cancel|wrong)\W*$/i;
// Questions and text to type need understanding, not keywords.
const QUESTION = /\?\s*$|^\s*(what|where|which|who|why|how|when|is|are|does|do i|can i|could i|tell me|describe|explain|help)\b/i;
const TYPING = /\b(type|write|enter|fill in|put|add|rename|search for|look for|call it|set the)\b/i;

// The last sentence or clause on its own: what was said after earlier words that went nowhere
// ("uh, show me… scroll down"), or a correction ("scroll down, no, scroll up").
function lastClause(text: string): string {
  return text.split(/[.!?,;]+/).map((c) => c.trim()).filter(Boolean).at(-1) ?? "";
}
const STOP_LISTENING = /\b(stop listening|stop voice( control)?|turn off voice control|that's all|goodbye)\b/i;

// The smallest region containing all of these (for identical names such as seven "Preferred").
function commonGroup(targets: Target[], ids: number[]): Target | undefined {
  const chains = ids.map((id) => {
    const out: number[] = [];
    for (let p = targets[id]?.parent; p !== undefined; p = targets[p]?.parent) out.push(p);
    return out;
  });
  return chains[0]?.map((p) => targets[p]).find((g) => g && chains.every((c) => c.includes(g.id)));
}

export function VoiceIntent() {
  const { session, speaker, status: listen } = useLiveVoice();
  const token = useAuthToken();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // From any page.
  useVoiceActions([{ names: ["Go back", "back", "previous page", "go to the previous page"], run: () => history.back(), message: "Went back.", when: () => history.length > 1 }]);
  const announce = useAnnounce();
  const recent = useRef<HTMLElement | null>(null); // last selected or acted on
  const guessed = useRef<HTMLElement | null>(null); // the guess highlighted now
  const busy = useRef(false);
  const lastTurn = useRef("");
  // A pending suggestion: "yes" carries it out with its verb, "no" drops it.
  const suggestion = useRef<{ el: HTMLElement; verb: Verb | null; at: number } | null>(null);
  const conversation = useRef<AgentTurn[]>([]);
  const askedAt = useRef(0); // when the assistant last asked a question
  const agentRun = useRef<{ text: string; abort: AbortController; started: boolean } | null>(null);

  useEffect(() => {
    const remember = (role: AgentTurn["role"], text: string) => {
      conversation.current = [...conversation.current, { role, text }].slice(-12);
    };
    // Show, announce and (if enabled) speak a reply.
    const reply = (text: string) => {
      setStatus(text);
      announce(text);
      if (getVoiceSettings().speak) speaker.say(text);
    };

    const idOf = (targets: Target[], el: Element | null) => (el ? targets.find((t) => t.el === el)?.id : undefined);
    // The groups around where the person is working: the focused element, else the last action.
    const contextOf = (targets: Target[]) => {
      const at = document.activeElement && document.activeElement !== document.body ? document.activeElement : recent.current;
      const ids = new Set<number>();
      if (at) for (const t of targets) if (t.kind === "group" && t.el.contains(at)) ids.add(t.id);
      // Nothing in particular: the page's main region (the open job) is where they are.
      if (!ids.size) for (const t of targets) if (t.primary) ids.add(t.id);
      return ids;
    };
    const pick = (text: string, targets: Target[]): Match | null =>
      bestMatch(text, targets, { recent: idOf(targets, recent.current), sticky: idOf(targets, guessed.current), context: contextOf(targets) });

    // Actions run one after another (an assistant reply may contain several).
    let chain: Promise<void> = Promise.resolve();
    const perform = (t: Target, verb: Verb | null, narrate: boolean, all: Target[]) => {
      suggestion.current = null;
      guessed.current = null;
      const label = intentLabel(t, verb);
      highlights.doing(highlightBox(t), label);
      setStatus(label);
      chain = chain.then(async () => {
        // One frame between actions, so a typed value is in place before its button is pressed.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        busy.current = true;
        try {
          const out = await execute(t, verb);
          recent.current = out.el;
          // The control's own words when it has them (data-voice-say); an option chosen in a named
          // row says the row ("Remote work options: Preferred."); else the confirmation.
          const row = t.kind === "radio" && t.parent !== undefined ? all[t.parent]?.label : undefined;
          const words = (out.changed && t.el.dataset.voiceSay) || (out.changed && row ? COPY.voice.chosen(row, t.label) : out.message);
          highlights.done(highlightBox({ ...t, opener: undefined, el: out.el }), out.message);
          remember("assistant", `[did: ${verb ?? "select"} ${t.label}]`);
          if (narrate) reply(words);
          else setStatus(out.message);
        } finally {
          busy.current = false;
        }
      });
    };
    const run = (t: Target, verb: Verb | null, all: Target[]) => {
      session.consume();
      perform(t, verb, true, all);
    };

    // ---- The assistant -------------------------------------------------------------------
    const agentAvailable = () => getVoiceSettings().agent && !!tokenRef.current;

    // answering: a proposal was waiting when they spoke; a different choice in reply is their answer.
    const startAgent = (text: string, targets: Target[], guesses: number[], fallback: () => void, answering: HTMLElement | null = null) => {
      agentRun.current?.abort.abort();
      const abort = new AbortController();
      const runState = { text, abort, started: false };
      agentRun.current = runState;
      remember("user", text);
      setStatus(COPY.voice.thinking);
      const timer = window.setTimeout(() => {
        if (!runState.started) abort.abort();
      }, AGENT_TIMEOUT_MS);
      const settings = getVoiceSettings();
      const body = buildAgentRequest({
        utterance: text,
        targets,
        selection: idOf(targets, recent.current),
        guesses,
        guidance: settings.guidance,
        history: conversation.current.slice(0, -1),
      });
      const said: string[] = [];
      let answered = false; // their reply chose something: the confirmation replaces any question
      const onLine = (line: AgentLine) => {
        if (agentRun.current !== runState) return;
        if (!runState.started) {
          runState.started = true;
          window.clearTimeout(timer);
          session.consume();
          speaker.stop();
        }
        if (line.type === "error") throw new Error("agent error");
        if (line.type === "say") {
          if (answered) return;
          said.push(line.text);
          if (line.text.trim().endsWith("?")) askedAt.current = Date.now();
          reply(line.text);
          return;
        }
        const t = targets.find((x) => x.id === line.id);
        if (!t || t.private || t.danger) return;
        if (line.type === "type") {
          if (t.kind !== "text") return;
          highlights.doing(highlightBox(t), COPY.voice.typing(t.label));
          chain = chain.then(() => {
            fillText(t.el, line.text);
            recent.current = t.el;
            highlights.done(highlightBox(t), COPY.voice.typed(line.text));
            remember("assistant", `[typed "${line.text}" into ${t.label}]`);
          });
          return;
        }
        const confirmOnly = t.el.hasAttribute("data-voice-confirm");
        // They answered a proposal by naming another choice ("flexible hours"): that is the
        // decision, so do it rather than ask again.
        if (line.type === "ask" && answering && t.el !== answering && !confirmOnly) {
          answered = true;
          const where = t.parent !== undefined ? targets[t.parent]?.label : undefined;
          perform(t, line.verb, false, targets);
          reply(COPY.voice.chosen(where, t.label));
          return;
        }
        // Approving, sending, opening the employer's site: always the person's own "yes".
        const needsYes = line.type === "ask" || confirmOnly;
        if (needsYes) {
          // Spelled out for the next turn, so an answer like "flexible hours" is read against it.
          const where = t.parent !== undefined ? ` in "${targets[t.parent]?.label}"` : "";
          remember("assistant", `[proposed: ${line.verb ?? "select"} "${t.label}"${where}, waiting for yes or another choice]`);
          suggestion.current = { el: t.el, verb: line.verb, at: Date.now() };
          askedAt.current = Date.now();
          highlights.guess(highlightBox(t), intentLabel(t, line.verb), "unsure");
          return;
        }
        perform(t, line.verb, false, targets);
      };
      streamAgent(body, tokenRef.current!, onLine, abort.signal)
        .then(() => {
          if (agentRun.current === runState && said.length) remember("assistant", said.join(" "));
          if (agentRun.current === runState && !runState.started) fallback();
        })
        .catch(() => {
          // Unavailable, timed out, or failed before acting: keyword matching answers instead
          // (unless the person has already moved on to something new).
          if (agentRun.current === runState && !runState.started) fallback();
        })
        .finally(() => {
          window.clearTimeout(timer);
          if (agentRun.current === runState) agentRun.current = null;
        });
    };

    // ---- Keyword fallback for uncertain matches ------------------------------------------------
    const keywordFallback = (text: string, targets: Target[], m: Match | null, definite: boolean) => {
      if (!m) {
        guessed.current = null;
        highlights.clearGuess();
        const here = alreadyHere(text, targets);
        if (here || definite) session.consume();
        setStatus(here ? COPY.voice.alreadyHere(targets[here.id].label) : COPY.voice.noMatch);
        if (definite) announce(here ? COPY.voice.alreadyHere(targets[here.id].label) : COPY.voice.noMatch);
        return;
      }
      const t = targets[m.id];
      const rival = m.ambiguousWith !== undefined ? targets[m.ambiguousWith] : undefined;
      if (rival && rival.label === t.label) {
        // Same name in several places ("Preferred" on every row): ask by place, never pick one.
        const same = targets.filter((x) => x.label === t.label && x.kind === t.kind).map((x) => x.id);
        const group = commonGroup(targets, same);
        if (group) highlights.guess(highlightBox(group), group.label, "unsure");
        const places = same.map((id) => targets[targets[id].parent ?? -1]?.label).filter(Boolean) as string[];
        const ask = COPY.voice.whichPlace(t.label, places);
        setStatus(ask);
        if (definite) announce(ask);
        return;
      }
      guessed.current = t.el;
      highlights.guess(highlightBox(t), intentLabel(t, m.verb), "unsure");
      if (!rival && definite) {
        suggestion.current = { el: t.el, verb: m.verb, at: Date.now() };
        session.consume();
      }
      const ask = rival ? COPY.voice.whichOne(t.label, rival.label) : COPY.voice.unsure(t.label);
      setStatus(ask);
      if (definite) announce(ask);
    };

    // definite: the turn really ended (turn.end), not just predicted to (turn.eager_end).
    const evaluate = (final: boolean, definite = false) => {
      if (busy.current) return;
      // After a correction ("…wait, voice reader") only the corrected part counts.
      const text = afterCorrection(session.getSnapshot().transcript);
      if (!text) {
        if (!suggestion.current) highlights.clearGuess(); // keep showing what "yes" would confirm
        return;
      }
      // The assistant is already answering exactly this: nothing more to do.
      if (agentRun.current && agentRun.current.text === text && final) return;
      if (final && STOP_LISTENING.test(text)) {
        session.consume();
        session.stop();
        return;
      }
      // A fresh command after words that went nowhere counts on its own.
      const clause = lastClause(text);
      const scroll = parseScroll(text) ?? parseScroll(lastTurn.current) ?? parseScroll(clause);
      if (scroll) {
        highlights.clearGuess();
        if (!final) return setStatus(scroll.dir < 0 ? COPY.voice.scrollingUp : COPY.voice.scrollingDown);
        session.consume();
        const msg = scrollPage(scroll, recent.current?.isConnected ? recent.current : document.activeElement);
        setStatus(msg);
        announce(msg);
        return;
      }
      performance.mark("voice:match-start");
      const targets = scanCached();
      performance.mark("voice:scanned");
      const said = parse(text);

      // Answering a suggestion: "yes" confirms it, "no" drops it; anything else is new.
      const s = suggestion.current;
      if (s && (Date.now() - s.at > SUGGESTION_MS || !s.el.isConnected)) suggestion.current = null;
      if (suggestion.current && said.verb === "do" && !said.words.length) {
        const id = idOf(targets, suggestion.current.el);
        if (!final || id === undefined) return;
        remember("user", text);
        run(targets[id], suggestion.current.verb, targets);
        return;
      }
      if (suggestion.current && NO.test(text)) {
        if (!final) return;
        session.consume();
        suggestion.current = null;
        highlights.clearGuess();
        remember("user", text);
        reply(COPY.voice.dismissed);
        return;
      }
      const pendingProposal = suggestion.current?.el ?? null;
      if (final) suggestion.current = null;

      // Only filler ("it.", "um", "please"): nothing to do, and nothing to say about it.
      if (!said.verb && !said.words.length) {
        if (final) session.consume();
        return;
      }
      const answering = Date.now() - askedAt.current < ANSWER_MS;
      // Just a verb ("turn it on", "press it"): it applies to what is selected now.
      if (said.verb && !said.words.length && !answering) {
        const focus = document.activeElement !== document.body ? document.activeElement : null;
        const around = focus ? targets.filter((t) => t.kind === "group" && t.el.contains(focus)).at(-1)?.id : undefined;
        const anchor = idOf(targets, recent.current) ?? idOf(targets, focus) ?? around;
        const r = resolveVerbOnly(said.verb, anchor, targets);
        if (!final) {
          if (r && (said.verb === "do" || /\b(it|that|this|them|those)\b/i.test(text))) {
            const id = "act" in r ? r.act : r.ask;
            const label = "act" in r ? intentLabel(targets[id], said.verb) : targets[id].label;
            highlights.guess(highlightBox(targets[id]), label, "act" in r ? "guess" : "unsure");
            setStatus(label);
          }
          return;
        }
        if (!definite && said.verb !== "do" && !/\b(it|that|this|them|those)\b/i.test(text)) return;
        if (r && "act" in r) {
          remember("user", text);
          return run(targets[r.act], said.verb, targets);
        }
        if (agentAvailable()) return startAgent(text, targets, r && "ask" in r ? r.options : [], () => keywordFallback(text, targets, null, true));
        session.consume();
        if (!r) {
          const msg = anchor === undefined ? COPY.voice.nothingSelected : COPY.voice.verbDoesNotFit(targets[anchor].label);
          setStatus(msg);
          announce(msg);
          return;
        }
        recent.current = targets[r.ask].el;
        highlights.guess(highlightBox(targets[r.ask]), targets[r.ask].label, "unsure");
        const ask = COPY.voice.whichOf(r.options.map((i) => targets[i].label));
        setStatus(ask);
        announce(ask);
        return;
      }
      let m = pick(text, targets);
      // Earlier chatter must not block a clear command: try the latest turn, then the latest
      // clause, on its own too.
      for (const alone of [lastTurn.current, clause]) {
        if (!final || m?.confident || !alone || alone === text) continue;
        const a = pick(alone, targets);
        if (a?.confident) m = a;
      }
      performance.measure("voice:scan", "voice:match-start", "voice:scanned");
      performance.measure("voice:match", "voice:match-start");

      // While words arrive: show the best guess (a faint one when nothing is certain).
      if (!final) {
        if (!m) {
          const id = looseGuess(text, targets);
          guessed.current = null;
          if (id === null) highlights.clearGuess();
          else {
            highlights.guess(highlightBox(targets[id]), COPY.voice.maybe(targets[id].label), "hint");
            setStatus(COPY.voice.maybe(targets[id].label));
          }
          return;
        }
        const t = targets[m.id];
        const rival = m.ambiguousWith !== undefined ? targets[m.ambiguousWith] : undefined;
        // Several controls share this exact name: show the region they share, not one of them.
        const shown = rival && rival.label === t.label ? commonGroup(targets, [t.id, rival.id]) ?? t : t;
        guessed.current = shown === t ? t.el : null;
        highlights.guess(highlightBox(shown), shown === t ? intentLabel(t, m.verb) : shown.label, "guess");
        setStatus(shown === t ? intentLabel(t, m.verb) : shown.label);
        return;
      }

      // The end of what they said. Certain and simple: act now, locally.
      const needsUnderstanding = !m || !m.confident || answering || QUESTION.test(text) || TYPING.test(text);
      if (m && !needsUnderstanding) {
        remember("user", text);
        return run(targets[m.id], m.verb, targets);
      }
      // Otherwise the assistant decides (it gets keyword matching's guesses as hints); without
      // it, keyword matching asks. A predicted end starts the assistant early; a real one too.
      const guesses = m ? [m.id, ...(m.ambiguousWith !== undefined ? [m.ambiguousWith] : [])] : [];
      if (agentAvailable()) return startAgent(text, targets, guesses, () => keywordFallback(text, targets, m, true), pendingProposal);
      keywordFallback(text, targets, m, definite);
    };

    session.turns = {
      onStart: () => {
        void scanCached();
        speaker.stop(); // the person is talking: stop speaking
      },
      onUpdate: (turn) => {
        lastTurn.current = turn;
        evaluate(false);
      },
      onEagerEnd: (turn) => {
        lastTurn.current = turn;
        evaluate(true);
      },
      onResume: () => {
        // They were not done: an early start of the assistant is dropped (unless it already acted).
        const r = agentRun.current;
        if (r && !r.started) {
          r.abort.abort();
          agentRun.current = null;
        }
      },
      onEnd: (turn) => {
        lastTurn.current = turn;
        evaluate(true, true);
      },
    };
    return () => {
      session.turns = {};
      agentRun.current?.abort.abort();
    };
  }, [session, speaker, announce]);

  // Listening ended: the guess goes; the selection stays a while longer, then fades.
  useEffect(() => {
    if (listen !== "off") return;
    suggestion.current = null;
    agentRun.current?.abort.abort();
    highlights.clearGuess();
    const t = highlights.expireSelection(SELECTION_AFTER_STOP_MS);
    const s = window.setTimeout(() => setStatus(""), SELECTION_AFTER_STOP_MS);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(s);
    };
  }, [listen]);

  return <HighlightLayer />;
}
