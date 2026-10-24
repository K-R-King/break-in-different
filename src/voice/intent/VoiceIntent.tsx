// From words to actions with the least delay. Every partial transcript is matched against the
// page (local, synchronous) and the best target is highlighted at once; the action runs at the
// first sign the person has finished (Cartesia's turn.eager_end, else turn.end).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAnnounce } from "../../a11y/Announcer";
import { COPY } from "../../copy";
import { useLiveVoice } from "../live/LiveVoice";
import { execute, intentLabel } from "./execute";
import { highlights, HighlightLayer } from "./highlight";
import { alreadyHere, bestMatch, type Match } from "./match";
import { highlightBox, scanCached, type Target } from "./scan";

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

const STOP_LISTENING = /\b(stop listening|stop voice( control)?|turn off voice control|that's all|goodbye)\b/i;

export function VoiceIntent() {
  const { session, status: listen } = useLiveVoice();
  const announce = useAnnounce();
  const recent = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const lastTurn = useRef("");

  useEffect(() => {
    const pick = (text: string, targets: Target[]): Match | null => {
      const recentId = targets.find((t) => t.el === recent.current)?.id;
      return bestMatch(text, targets, recentId);
    };

    const evaluate = (final: boolean) => {
      if (busy.current) return;
      const text = session.getSnapshot().transcript;
      if (!text) {
        highlights.clearGuess();
        return;
      }
      if (final && STOP_LISTENING.test(text)) {
        session.consume();
        session.stop();
        return;
      }
      performance.mark("voice:match-start");
      const targets = scanCached();
      performance.mark("voice:scanned");
      let m = pick(text, targets);
      // Earlier chatter must not block a clear command: try the latest turn on its own too.
      if (final && !m?.confident && lastTurn.current && lastTurn.current !== text) {
        const alone = pick(lastTurn.current, targets);
        if (alone?.confident) m = alone;
      }
      performance.measure("voice:scan", "voice:match-start", "voice:scanned");
      performance.measure("voice:match", "voice:match-start");
      if (!m) {
        highlights.clearGuess();
        const here = final ? alreadyHere(text, targets) : null;
        if (here) session.consume();
        setStatus(here ? COPY.voice.alreadyHere(targets[here.id].label) : final ? COPY.voice.noMatch : "");
        return;
      }
      const t = targets[m.id];
      const label = intentLabel(t, m.verb);
      if (!final || !m.confident) {
        highlights.guess(highlightBox(t), label, final ? "unsure" : "guess");
        if (final) {
          const rival = m.ambiguousWith !== undefined ? targets[m.ambiguousWith] : undefined;
          setStatus(rival ? COPY.voice.whichOne(t.label, rival.label) : COPY.voice.unsure(t.label));
        } else setStatus(label);
        return;
      }
      // Act now. The words are used up, so the next command starts clean.
      busy.current = true;
      session.consume();
      highlights.doing(highlightBox(t), label);
      setStatus(label);
      void execute(t, m.verb)
        .then((out) => {
          recent.current = out.el;
          highlights.done(out.done ? highlightBox({ ...t, opener: undefined, el: out.el }) : highlightBox(t), out.message);
          setStatus(out.message);
          announce(out.message);
        })
        .finally(() => {
          busy.current = false;
        });
    };

    session.turns = {
      onStart: () => void scanCached(),
      onUpdate: (turn) => {
        lastTurn.current = turn;
        evaluate(false);
      },
      onEagerEnd: (turn) => {
        lastTurn.current = turn;
        evaluate(true);
      },
      onEnd: (turn) => {
        lastTurn.current = turn;
        evaluate(true);
      },
    };
    return () => {
      session.turns = {};
    };
  }, [session, announce]);

  // Listening ended: the guess goes (an action's fading highlight stays until it fades).
  useEffect(() => {
    if (listen === "off") {
      highlights.clearGuess();
      setStatus("");
    }
  }, [listen]);

  return <HighlightLayer />;
}
