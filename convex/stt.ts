// Speech-to-text for push-to-talk voice commands and dictation (C8: Cartesia, batch STT).
// The recording is sent to Cartesia through this action, transcribed, and never stored or logged.
import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { LIMITS } from "../shared/taxonomy";
import { CARTESIA_VERSION } from "./tts";

const MAX_BYTES = 2 * 1024 * 1024; // about 60 s of compressed speech
const ALLOWED = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];

export async function cartesiaTranscribe(key: string, audio: ArrayBuffer, mimeType: string): Promise<string> {
  const ext = mimeType.split("/")[1].replace("x-", "").replace("mpeg", "mp3");
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), `speech.${ext}`);
  form.append("model", "ink-whisper");
  form.append("language", "en");
  const res = await fetch("https://api.cartesia.ai/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": CARTESIA_VERSION },
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = (await res.json()) as { text?: string };
  return (out.text ?? "").trim();
}

export const transcribe = action({
  args: { audio: v.bytes(), mimeType: v.string() },
  handler: async (ctx, { audio, mimeType }): Promise<{ text: string }> => {
    const userId = await requireUser(ctx);
    const key = process.env.CARTESIA_API_KEY;
    if (!key || process.env.MOCK_AI === "1") fail("STT_UNAVAILABLE", "Voice input is unavailable. Use the keyboard instead.");
    const baseType = mimeType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED.includes(baseType)) fail("UNSUPPORTED_TYPE", "That recording format is not supported.");
    if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES) fail("VALIDATION", "That recording is too long. Keep it under a minute.");
    await enforceLimit(ctx, userId, "stt", LIMITS.sttCallsPerHour, 60 * 60 * 1000);

    try {
      return { text: await cartesiaTranscribe(key, audio, baseType) };
    } catch {
      console.warn("stt: CARTESIA_FAILED");
      fail("STT_UNAVAILABLE", "Voice input is unavailable right now. Use the keyboard instead.", { retryable: true });
    }
  },
});
