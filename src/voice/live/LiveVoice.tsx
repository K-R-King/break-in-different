import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAnnounce } from "../../a11y/Announcer";
import { COPY } from "../../copy";
import { ListenSession, type ListenSnapshot } from "./session";
import { voiceKeyterms } from "../intent/keyterms";

interface LiveVoiceCtx extends ListenSnapshot {
  session: ListenSession;
  toggle: () => void;
  stop: () => void;
}

const Ctx = createContext<LiveVoiceCtx | null>(null);

// Streaming voice input: one microphone session, live words from Cartesia speech-to-text.
// Later pieces (understanding, highlighting, actions) subscribe to session.turns.
export function LiveVoiceProvider({ children }: { children: ReactNode }) {
  const mintToken = useAction(api.voice.token);
  const mintRef = useRef(mintToken);
  mintRef.current = mintToken;
  const announce = useAnnounce();
  const { isAuthenticated } = useConvexAuth();

  const session = useMemo(
    () =>
      new ListenSession({
        getToken: async () => (await mintRef.current({})).token,
        copy: {
          insecure: COPY.voice.insecure(`http://localhost:${location.port && location.port !== "80" ? location.port : "8080"}`),
          unsupported: COPY.voice.unsupported,
          blocked: COPY.voice.blocked,
          deviceLost: COPY.voice.deviceLost,
          failed: COPY.voice.failed,
        },
        keyterms: voiceKeyterms,
      }),
    [],
  );
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  // Announce state changes once (not every partial transcript).
  const lastStatus = useRef(snap.status);
  useEffect(() => {
    if (snap.status === lastStatus.current) return;
    lastStatus.current = snap.status;
    if (snap.status === "listening") announce(COPY.voice.listening);
    if (snap.status === "off") announce(snap.notice || COPY.voice.stopped);
  }, [snap.status, snap.notice, announce]);

  // Signing out ends the session; leaving the app releases the microphone.
  useEffect(() => {
    if (!isAuthenticated && session.active) session.stop();
  }, [isAuthenticated, session]);
  useEffect(() => () => session.stop(), [session]);

  const value: LiveVoiceCtx = {
    ...snap,
    session,
    toggle: () => (session.active ? session.stop() : session.start()),
    stop: () => session.stop(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveVoice(): LiveVoiceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLiveVoice outside LiveVoiceProvider");
  return c;
}
