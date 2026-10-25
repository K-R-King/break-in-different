// One listening session: the microphone plus the Cartesia connection, outside React so no
// re-render or effect cleanup can tear it down. React subscribes to its snapshot.
import { Mic, micSupported } from "./mic";
import { PendingText } from "./pending";
import { TurnsSocket, type SocketState, type TurnSettings } from "./turnsSocket";

export type ListenStatus = "off" | "starting" | "listening" | "reconnecting";

export interface ListenSnapshot {
  status: ListenStatus;
  transcript: string; // the whole command heard and not yet acted on, updated word by word
  heard: string; // what is being said now: this turn only, cleared when the person speaks again
  final: boolean; // the speaker paused (the last turn ended)
  notice: string;
  level: number; // microphone loudness 0..1
  muted: boolean; // the microphone is open but muted by the system or hardware: nothing is heard
}

export interface TurnListener {
  onStart?(): void; // speech began: a good moment to prepare
  onUpdate?(transcript: string): void;
  onEagerEnd?(transcript: string): void;
  onResume?(): void;
  onEnd?(transcript: string): void;
}

export interface SessionDeps {
  getToken: () => Promise<string>;
  copy: { insecure: string; unsupported: string; blocked: string; deviceLost: string; failed: (why: string) => string };
  settings?: TurnSettings;
  keyterms?: () => string[];
}

const OFF: ListenSnapshot = { status: "off", transcript: "", heard: "", final: false, notice: "", level: 0, muted: false };

export class ListenSession {
  private snap: ListenSnapshot = OFF;
  private subs = new Set<() => void>();
  private mic: Mic | null = null;
  private socket: TurnsSocket | null = null;
  private pending = new PendingText();
  turns: TurnListener = {};

  constructor(private deps: SessionDeps) {}

  getSnapshot = () => this.snap;
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };

  get active() {
    return this.snap.status !== "off";
  }

  // Call directly from a click or key handler (see Mic.start).
  start() {
    if (this.active) return;
    if (!window.isSecureContext) return this.set({ ...OFF, notice: this.deps.copy.insecure });
    if (!micSupported()) return this.set({ ...OFF, notice: this.deps.copy.unsupported });
    this.pending.clear();
    this.set({ ...OFF, status: "starting" });

    // The first token is fetched while the microphone starts; reconnects fetch fresh ones.
    let first: Promise<string> | null = this.deps.getToken();
    first.catch(() => undefined);
    const mic = new Mic({
      onChunk: (c) => this.socket?.send(c),
      onLevel: (level) => this.set({ level }),
      onMuted: (muted) => this.set({ muted }),
      onEnded: () => this.fail(this.deps.copy.deviceLost),
    });
    const socket = new TurnsSocket(
      {
        getToken: () => {
          const t = first ?? this.deps.getToken();
          first = null;
          return t;
        },
        sampleRate: () => mic.sampleRate,
        settings: this.deps.settings,
        keyterms: this.deps.keyterms?.(),
      },
      {
        onState: (s: SocketState) => {
          if (this.socket !== socket) return;
          if (s === "open") this.set({ status: "listening", notice: "" });
          else if (s === "reconnecting") this.set({ status: "reconnecting" });
        },
        onTurnStart: () => {
          this.set({ heard: "" });
          this.turns.onStart?.();
        },
        onUpdate: (t) => {
          this.set({ transcript: this.pending.update(t), heard: t, final: false });
          this.turns.onUpdate?.(t);
        },
        onEagerEnd: (t) => {
          this.set({ transcript: this.pending.update(t), heard: t });
          this.turns.onEagerEnd?.(t);
        },
        onResume: () => this.turns.onResume?.(),
        onEnd: (t) => {
          this.set({ transcript: this.pending.end(t), heard: t, final: true });
          this.turns.onEnd?.(t);
        },
        onFatal: (why) => this.fail(this.deps.copy.failed(why)),
      },
    );
    this.mic = mic;
    this.socket = socket;
    mic.start().then(
      () => {
        if (this.socket === socket) socket.connect();
      },
      (e: unknown) => {
        const name = e instanceof DOMException ? e.name : "";
        this.fail(name === "NotAllowedError" || name === "SecurityError" ? this.deps.copy.blocked : this.deps.copy.unsupported);
      },
    );
  }

  // flush: finish transcribing what was already said (hold-to-talk release).
  stop(flush = false) {
    this.mic?.stop();
    this.socket?.close(flush);
    this.mic = null;
    this.socket = null;
    this.set({ ...OFF, transcript: this.snap.transcript, heard: this.snap.heard, final: true });
  }

  // The action recognizer acted on everything heard so far: drop it from the shown command.
  consume() {
    this.set({ transcript: this.pending.consume() });
  }

  configure(s: TurnSettings) {
    this.socket?.configure(s);
  }

  private fail(notice: string) {
    this.stop();
    this.set({ notice });
  }

  private set(patch: Partial<ListenSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.subs) fn();
  }
}
