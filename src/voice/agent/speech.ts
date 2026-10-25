// Spoken replies with the least delay: each sentence goes to Cartesia text-to-speech over a
// WebSocket as soon as it is known and plays as its audio streams in (raw PCM through Web Audio).
// Sentences play strictly in order; talking again stops it at once. Falls back to the browser's
// own voice when Cartesia is unavailable. Protocol: wss://api.cartesia.ai/tts/websocket
// (see CARTESIA.md; access tokens come from Convex, the API key never reaches the browser).
const VERSION = "2026-08-14";
const MODEL = "sonic-3.6";
const RATE = 24000;

interface Pending {
  id: string;
  buffers: AudioBuffer[];
  done: boolean;
}

export class Speaker {
  private ws: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private voiceId = "";
  private ctx: AudioContext | null = null;
  private queue: Pending[] = []; // sentences in speaking order
  private sources = new Set<AudioBufferSourceNode>();
  private playhead = 0;
  private seq = 0;
  private failed = false;

  constructor(private getToken: () => Promise<{ token: string; voiceId: string }>) {}

  // Call from a click or key press so the browser allows audio.
  unlock() {
    try {
      this.ctx ??= new AudioContext({ sampleRate: RATE });
      void this.ctx.resume();
    } catch {
      this.failed = true;
    }
  }

  // Opens the connection ahead of time (when listening starts), so the first reply is not
  // delayed by fetching a token and connecting.
  warm() {
    if (this.failed || !this.ctx) return;
    void this.open().catch(() => {
      this.failed = true;
    });
  }

  get speaking(): boolean {
    return this.queue.length > 0 || this.sources.size > 0 || (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking);
  }

  say(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (this.failed || !this.ctx) return this.browserSay(clean);
    const id = `bid-${Date.now().toString(36)}-${this.seq++}`;
    this.queue.push({ id, buffers: [], done: false });
    void this.open()
      .then((ws) =>
        ws.send(
          JSON.stringify({
            model_id: MODEL,
            transcript: clean,
            voice: this.voiceId,
            language: "en",
            context_id: id,
            continue: false,
            max_buffer_delay_ms: 0,
            output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: RATE },
          }),
        ),
      )
      .catch(() => {
        this.queue = this.queue.filter((q) => q.id !== id);
        this.failed = true;
        this.browserSay(clean);
      });
  }

  // Stop speaking now (the person started talking, or a new reply begins).
  stop() {
    for (const q of this.queue) if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ context_id: q.id, cancel: true }));
    this.queue = [];
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.playhead = 0;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  close() {
    this.stop();
    this.ws?.close();
    this.ws = null;
  }

  private browserSay(text: string) {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  private open(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    this.opening ??= (async () => {
      const { token, voiceId } = await this.getToken();
      this.voiceId = voiceId;
      const url = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${VERSION}&access_token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("TTS socket failed"));
      });
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
      };
      this.ws = ws;
      return ws;
    })().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private onMessage(data: unknown) {
    if (typeof data !== "string") return;
    let m: { type?: string; context_id?: string; data?: string; done?: boolean };
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    const q = this.queue.find((x) => x.id === m.context_id);
    if (!q) return; // cancelled
    if (m.type === "chunk" && m.data && this.ctx) {
      const bytes = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0));
      const samples = new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
      const buf = this.ctx.createBuffer(1, samples.length, RATE);
      buf.copyToChannel(samples, 0);
      q.buffers.push(buf);
    }
    if (m.type === "done" || m.done || m.type === "error") q.done = true;
    this.pump();
  }

  // Plays the head sentence's audio as it arrives; moves on when it is finished.
  private pump() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.queue.length) {
      const head = this.queue[0];
      for (const buf of head.buffers.splice(0)) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const at = Math.max(ctx.currentTime + 0.01, this.playhead);
        src.start(at);
        this.playhead = at + buf.duration;
        this.sources.add(src);
        src.onended = () => this.sources.delete(src);
      }
      if (!head.done) return;
      this.queue.shift();
    }
  }
}
