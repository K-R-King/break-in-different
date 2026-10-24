// Read aloud: Cartesia TTS over SSE with word timestamps, cached by text hash.
// Cartesia only ever receives public job listing text.
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { sha256 } from "./lib/text";
import { LIMITS } from "../shared/taxonomy";

export const CARTESIA_VERSION = "2026-08-14";
const MODEL = "sonic-3.6";
export const SAMPLE_RATE = 24000;
// Any voice works; this one is the example voice in Cartesia's API reference.
export const DEFAULT_VOICE = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

type Word = { word: string; start: number; end: number };

export const cacheGet = internalQuery({
  args: { textHash: v.string(), voiceId: v.string() },
  handler: async (ctx, a) =>
    ctx.db
      .query("ttsCache")
      .withIndex("by_hash", (q) => q.eq("textHash", a.textHash).eq("voiceId", a.voiceId))
      .unique(),
});

export const cachePut = internalMutation({
  args: {
    textHash: v.string(),
    model: v.string(),
    voiceId: v.string(),
    storageId: v.id("_storage"),
    words: v.array(v.object({ word: v.string(), start: v.number(), end: v.number() })),
    durationMs: v.number(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("ttsCache", a);
  },
});

export const synthesize = action({
  args: { jobId: v.id("jobs"), section: v.union(v.literal("summary"), v.literal("full")) },
  handler: async (ctx, { jobId, section }): Promise<{ audioUrl: string; words: Word[]; text: string; cached: boolean }> => {
    const userId = await requireUser(ctx);
    const text = await ctx.runQuery(internal.jobs.speakableText, { jobId, section });
    if (!text) fail("NOT_FOUND", "We could not find that job.");
    const voiceId = process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE;
    const textHash = await sha256(`${MODEL}|${text}`);
    const hit = await ctx.runQuery(internal.tts.cacheGet, { textHash, voiceId });
    if (hit) {
      const url = await ctx.storage.getUrl(hit.storageId);
      if (url) return { audioUrl: url, words: hit.words, text, cached: true };
    }
    const key = process.env.CARTESIA_API_KEY;
    if (!key || process.env.MOCK_AI === "1") fail("TTS_UNAVAILABLE", "Using your browser's voice.", { retryable: false });
    await enforceLimit(ctx, userId, "tts", LIMITS.ttsCallsPerHour, 60 * 60 * 1000);

    let pcm: Uint8Array;
    let words: Word[];
    try {
      ({ pcm, words } = await cartesiaSse(key, voiceId, text));
    } catch {
      console.warn("tts: CARTESIA_FAILED");
      fail("TTS_UNAVAILABLE", "Using your browser's voice.", { retryable: true });
    }
    const wav = wavFromPcm16(pcm, SAMPLE_RATE);
    const storageId = await ctx.storage.store(new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }));
    const durationMs = Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000);
    await ctx.runMutation(internal.tts.cachePut, { textHash, model: MODEL, voiceId, storageId, words, durationMs });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) fail("TTS_UNAVAILABLE", "Using your browser's voice.");
    return { audioUrl: url, words, text, cached: false };
  },
});

export async function cartesiaSse(key: string, voiceId: string, transcript: string): Promise<{ pcm: Uint8Array; words: Word[] }> {
  const res = await fetch("https://api.cartesia.ai/tts/sse", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: MODEL,
      transcript,
      voice: voiceId,
      language: "en",
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: SAMPLE_RATE },
      add_timestamps: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  const words: Word[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  while (!done) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      const ev = JSON.parse(data) as {
        type: string;
        data?: string;
        word_timestamps?: { words: string[]; start: number[]; end: number[] };
        error?: string;
      };
      if (ev.type === "chunk" && ev.data) chunks.push(base64ToBytes(ev.data));
      else if (ev.type === "timestamps" && ev.word_timestamps) {
        const w = ev.word_timestamps;
        w.words.forEach((word, i) => words.push({ word, start: w.start[i], end: w.end[i] }));
      } else if (ev.type === "error") throw new Error("CARTESIA_ERROR");
      else if (ev.type === "done") done = true;
    }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error("NO_AUDIO");
  const pcm = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    pcm.set(c, off);
    off += c.length;
  }
  return { pcm, words };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function wavFromPcm16(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
