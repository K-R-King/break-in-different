// Cartesia Ink 2 live speech-to-text over the turns WebSocket (built-in turn detection).
// Protocol: AsyncAPI 2026-08-14, /stt/turns/websocket. Browser auth: a short-lived access token
// in the query string; the API key never leaves Convex.
// The connection is independent of the microphone: if it drops, it reconnects with a fresh
// token while audio keeps being captured and buffered, so nothing the person says is lost and
// the microphone never switches off.

export const CARTESIA_VERSION = "2026-08-14";
const URL_BASE = "wss://api.cartesia.ai/stt/turns/websocket";
const BUFFER_CHUNKS = 50; // 5 s of 100 ms chunks kept while (re)connecting
const BACKOFF_MS = [250, 1000, 2000, 4000, 8000];

export interface TurnSettings {
  start: number;
  eager: number;
  end: number;
  timeoutMs: number;
}

// Cartesia's documented "Balanced" preset (the default).
export const BALANCED: TurnSettings = { start: 0.8, eager: 0.6, end: 0.3, timeoutMs: 5600 };

export type SocketState = "connecting" | "open" | "reconnecting" | "closed";

export interface TurnHandlers {
  onState(s: SocketState): void;
  onTurnStart(): void;
  onUpdate(transcript: string): void; // cumulative within the turn, never revised
  onEagerEnd(transcript: string): void; // the person may be done
  onResume(): void; // they were not
  onEnd(transcript: string): void; // definitive
  onFatal(message: string): void; // gave up; the session should stop
}

export interface TurnsOptions {
  getToken: () => Promise<string>;
  sampleRate: () => number;
  settings?: TurnSettings;
  keyterms?: string[];
  WebSocketImpl?: typeof WebSocket; // tests
}

export function turnsUrl(token: string, sampleRate: number, s: TurnSettings, keyterms: string[] = []): string {
  const url = new URL(URL_BASE);
  url.searchParams.set("model", "ink-2");
  url.searchParams.set("encoding", "pcm_s16le");
  url.searchParams.set("sample_rate", String(Math.round(sampleRate)));
  url.searchParams.set("cartesia_version", CARTESIA_VERSION);
  url.searchParams.set("access_token", token);
  url.searchParams.set("turn_start_threshold", String(s.start));
  url.searchParams.set("turn_eager_end_threshold", String(s.eager));
  url.searchParams.set("turn_end_threshold", String(s.end));
  url.searchParams.set("turn_end_timeout_ms", String(s.timeoutMs));
  // Up to 100 key terms, 1,200 characters in total.
  let budget = 1200;
  for (const k of keyterms.slice(0, 100)) {
    if (k.length > budget) break;
    budget -= k.length;
    url.searchParams.append("keyterm", k);
  }
  return url.toString();
}

export class TurnsSocket {
  private ws: WebSocket | null = null;
  private queue: ArrayBuffer[] = [];
  private closed = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settings: TurnSettings;

  constructor(private opts: TurnsOptions, private h: TurnHandlers) {
    this.settings = opts.settings ?? BALANCED;
  }

  connect() {
    this.open("connecting");
  }

  // Called for every 100 ms chunk. Sent at once when connected, buffered otherwise.
  send(chunk: ArrayBuffer) {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
      return;
    }
    this.queue.push(chunk);
    if (this.queue.length > BUFFER_CHUNKS) this.queue.shift();
  }

  configure(s: TurnSettings) {
    this.settings = s;
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: "config", turn: { start_threshold: s.start, eager_end_threshold: s.eager, end_threshold: s.end, end_timeout_ms: s.timeoutMs } }));
  }

  // flush: let the server finish transcribing what it has (emits the final turn.end), then close.
  close(flush = false) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    const ws = this.ws;
    if (flush && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "close" }));
      this.timer = setTimeout(() => ws.close(), 4000);
    } else {
      ws?.close();
      this.ws = null;
      this.h.onState("closed");
    }
  }

  private async open(state: "connecting" | "reconnecting") {
    this.h.onState(state);
    let token: string;
    try {
      token = await this.opts.getToken();
    } catch {
      return this.retry("Could not get a speech-to-text token.");
    }
    if (this.closed) return;
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    const ws = new Impl(turnsUrl(token, this.opts.sampleRate(), this.settings, this.opts.keyterms));
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    let errored = false;
    let openedAt = 0;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      openedAt = Date.now();
      this.h.onState("open");
      for (const c of this.queue.splice(0)) ws.send(c);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== "string") return;
      let m: { type?: string; transcript?: string; message?: string; status_code?: number };
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.type) {
        case "turn.start": this.h.onTurnStart(); break;
        case "turn.update": this.h.onUpdate(m.transcript ?? ""); break;
        case "turn.eager_end": this.h.onEagerEnd(m.transcript ?? ""); break;
        case "turn.resume": this.h.onResume(); break;
        case "turn.end": this.h.onEnd(m.transcript ?? ""); break;
        case "error":
          // Auth and request errors will not fix themselves by retrying.
          if (m.status_code && m.status_code >= 400 && m.status_code < 500 && m.status_code !== 408 && m.status_code !== 429) {
            this.closed = true;
            ws.close();
            this.h.onFatal(m.message ?? "Speech-to-text rejected the request.");
          }
          errored = true;
          break;
      }
    };
    ws.onerror = () => {
      errored = true;
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) {
        clearTimeout(this.timer);
        this.h.onState("closed");
        return;
      }
      // A connection that stayed up a while counts as healthy: start the backoff over.
      if (openedAt && Date.now() - openedAt > 5000) this.failures = 0;
      this.retry(errored ? "Speech-to-text connection failed." : "Speech-to-text connection closed.");
    };
  }

  private retry(reason: string) {
    if (this.closed) return;
    if (this.failures >= BACKOFF_MS.length) {
      this.closed = true;
      this.h.onState("closed");
      this.h.onFatal(`${reason} Gave up after ${BACKOFF_MS.length} tries.`);
      return;
    }
    const wait = BACKOFF_MS[this.failures++];
    this.h.onState("reconnecting");
    this.timer = setTimeout(() => void this.open("reconnecting"), wait);
  }
}
