// Connection logic against a fake WebSocket: buffering, events, reconnects, giving up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnsSocket, turnsUrl, BALANCED, type TurnHandlers } from "./turnsSocket";

class FakeWS {
  static all: FakeWS[] = [];
  static OPEN = 1;
  readyState = 0;
  binaryType = "";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: unknown) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  msg(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function handlers() {
  const log: string[] = [];
  const h: TurnHandlers = {
    onState: (s) => log.push(`state:${s}`),
    onTurnStart: () => log.push("start"),
    onUpdate: (t) => log.push(`update:${t}`),
    onEagerEnd: (t) => log.push(`eager:${t}`),
    onResume: () => log.push("resume"),
    onEnd: (t) => log.push(`end:${t}`),
    onFatal: (m) => log.push(`fatal:${m}`),
  };
  return { h, log };
}

const chunk = (n: number) => new Uint8Array([n]).buffer;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  FakeWS.all = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("turns URL", () => {
  it("has the documented parameters and respects the key term budget", () => {
    const u = new URL(turnsUrl("tok", 16000, BALANCED, ["Jobs Listing", "x".repeat(1190), "too long now"]));
    expect(u.origin + u.pathname).toBe("wss://api.cartesia.ai/stt/turns/websocket");
    expect(Object.fromEntries([...u.searchParams].filter(([k]) => k !== "keyterm"))).toEqual({
      model: "ink-2", encoding: "pcm_s16le", sample_rate: "16000", cartesia_version: "2026-08-14", access_token: "tok",
      turn_start_threshold: "0.8", turn_eager_end_threshold: "0.6", turn_end_threshold: "0.3", turn_end_timeout_ms: "5600",
    });
    expect(u.searchParams.getAll("keyterm")).toEqual(["Jobs Listing"]);
  });
});

describe("TurnsSocket", () => {
  it("buffers audio until the connection opens, then sends it in order", async () => {
    const { h } = handlers();
    const s = new TurnsSocket({ getToken: async () => "t1", sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.send(chunk(1));
    s.connect();
    s.send(chunk(2));
    await vi.waitFor(() => expect(FakeWS.all).toHaveLength(1));
    const ws = FakeWS.all[0];
    ws.open();
    s.send(chunk(3));
    expect(ws.sent.map((b) => new Uint8Array(b as ArrayBuffer)[0])).toEqual([1, 2, 3]);
  });

  it("passes turn events through", async () => {
    const { h, log } = handlers();
    const s = new TurnsSocket({ getToken: async () => "t", sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.connect();
    await vi.waitFor(() => expect(FakeWS.all).toHaveLength(1));
    const ws = FakeWS.all[0];
    ws.open();
    ws.msg({ type: "connected", request_id: "r" });
    ws.msg({ type: "turn.start" });
    ws.msg({ type: "turn.update", transcript: "show me" });
    ws.msg({ type: "turn.eager_end", transcript: "show me remote jobs" });
    ws.msg({ type: "turn.resume" });
    ws.msg({ type: "turn.end", transcript: "show me remote jobs please" });
    expect(log).toEqual(["state:connecting", "state:open", "start", "update:show me", "eager:show me remote jobs", "resume", "end:show me remote jobs please"]);
  });

  it("reconnects with a fresh token after a drop, keeping audio captured meanwhile", async () => {
    const { h, log } = handlers();
    let n = 0;
    const s = new TurnsSocket({ getToken: async () => `tok${++n}`, sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.connect();
    await vi.waitFor(() => expect(FakeWS.all).toHaveLength(1));
    FakeWS.all[0].open();
    FakeWS.all[0].drop();
    s.send(chunk(7)); // spoken while disconnected
    expect(log.at(-1)).toBe("state:reconnecting");
    await vi.advanceTimersByTimeAsync(250);
    await flush();
    expect(FakeWS.all).toHaveLength(2);
    expect(new URL(FakeWS.all[1].url).searchParams.get("access_token")).toBe("tok2");
    FakeWS.all[1].open();
    expect(new Uint8Array(FakeWS.all[1].sent[0] as ArrayBuffer)[0]).toBe(7);
    expect(log.at(-1)).toBe("state:open");
  });

  it("gives up after repeated failures instead of looping", async () => {
    const { h, log } = handlers();
    const s = new TurnsSocket({ getToken: async () => "t", sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.connect();
    for (let i = 0; i < 6; i++) {
      await vi.waitFor(() => expect(FakeWS.all).toHaveLength(i + 1));
      FakeWS.all[i].drop(); // closes right away, never healthy
      await vi.advanceTimersByTimeAsync(8000);
    }
    expect(log.filter((l) => l.startsWith("fatal"))).toHaveLength(1);
    expect(FakeWS.all).toHaveLength(6);
  });

  it("does not retry an authentication error", async () => {
    const { h, log } = handlers();
    const s = new TurnsSocket({ getToken: async () => "bad", sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.connect();
    await vi.waitFor(() => expect(FakeWS.all).toHaveLength(1));
    FakeWS.all[0].open();
    FakeWS.all[0].msg({ type: "error", status_code: 401, title: "Unauthorized", message: "Invalid token" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(FakeWS.all).toHaveLength(1);
    expect(log.at(-1)).toBe("fatal:Invalid token");
  });

  it("closing on purpose never reconnects; a flush close asks the server to finish first", async () => {
    const { h } = handlers();
    const s = new TurnsSocket({ getToken: async () => "t", sampleRate: () => 16000, WebSocketImpl: FakeWS as never }, h);
    s.connect();
    await vi.waitFor(() => expect(FakeWS.all).toHaveLength(1));
    FakeWS.all[0].open();
    s.close(true);
    expect(FakeWS.all[0].sent.at(-1)).toBe(JSON.stringify({ type: "close" }));
    FakeWS.all[0].drop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(FakeWS.all).toHaveLength(1);
  });
});
