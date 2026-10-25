// The microphone, opened once per session and kept open until stop(): no reopening between
// sentences or on reconnects, so the browser's microphone indicator stays steady.
// start() must be called directly from a click or key handler: the AudioContext is created
// and resumed synchronously there, otherwise Chrome may leave it suspended (no audio).
import { Chunker, Downsampler, level, toInt16 } from "./pcm";

export interface MicHandlers {
  onChunk(pcm: ArrayBuffer): void; // 100 ms of 16-bit mono PCM at `sampleRate`
  onLevel?(value: number): void;
  onMuted?(muted: boolean): void; // muted at the system or hardware level: the track sends silence
  onEnded(reason: "device" | "blocked" | "error"): void;
}

export function micSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== "undefined";
}

export class Mic {
  sampleRate = 16000;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private stopped = false;

  constructor(private h: MicHandlers) {}

  // Resolves once audio is flowing. Rejects (and cleans up) if permission is refused.
  start(): Promise<void> {
    // Synchronous part: runs inside the user gesture.
    const ctx = new AudioContext();
    this.ctx = ctx;
    const resumed = ctx.resume();
    const streamP = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const moduleP = ctx.audioWorklet.addModule("/voice/mic-worklet.js");
    return (async () => {
      let stream: MediaStream;
      try {
        [stream] = await Promise.all([streamP, moduleP, resumed]);
      } catch (e) {
        this.stop();
        throw e;
      }
      if (this.stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const down = new Downsampler(ctx.sampleRate);
      this.sampleRate = down.outRate;
      const chunker = new Chunker(Math.round(down.outRate / 10));
      const node = new AudioWorkletNode(ctx, "mic-tap");
      this.node = node;
      let lastLevel = 0;
      node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        for (const c of chunker.push(toInt16(down.push(ev.data)))) this.h.onChunk(c);
        const now = performance.now();
        if (this.h.onLevel && now - lastLevel > 100) {
          lastLevel = now;
          this.h.onLevel(level(ev.data));
        }
      };
      const src = ctx.createMediaStreamSource(stream);
      src.connect(node);
      // The tap must be pulled by the audio graph; a muted gain keeps it silent.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);
      const track = stream.getAudioTracks()[0];
      if (track) {
        if (track.muted) this.h.onMuted?.(true);
        track.addEventListener("mute", () => this.h.onMuted?.(true));
        track.addEventListener("unmute", () => this.h.onMuted?.(false));
      }
      // Unplugged headset, revoked permission, another app taking the device.
      track?.addEventListener("ended", () => {
        if (!this.stopped) {
          this.stop();
          this.h.onEnded("device");
        }
      });
    })();
  }

  stop() {
    this.stopped = true;
    if (this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }
}
