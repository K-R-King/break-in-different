// Live voice: short-lived Cartesia access tokens so the browser can stream microphone audio
// straight to speech-to-text. The API key stays in Convex. Each token lasts 60 seconds; an open
// connection keeps working after it expires, and reconnects ask for a new one.
import { action } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { LIMITS } from "../shared/taxonomy";
import { CARTESIA_VERSION } from "./tts";

export const token = action({
  args: {},
  handler: async (ctx): Promise<{ token: string; expiresAt: number }> => {
    const userId = await requireUser(ctx);
    const key = process.env.CARTESIA_API_KEY;
    if (!key || process.env.MOCK_AI === "1") fail("STT_UNAVAILABLE", "Live voice is unavailable.");
    await enforceLimit(ctx, userId, "voiceToken", LIMITS.voiceTokensPerHour, 60 * 60 * 1000);
    try {
      const res = await fetch("https://api.cartesia.ai/access-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({ grants: { stt: true }, expires_in: 60 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = (await res.json()) as { token?: string };
      if (!out.token) throw new Error("NO_TOKEN");
      return { token: out.token, expiresAt: Date.now() + 60_000 };
    } catch {
      console.warn("voice: CARTESIA_TOKEN_FAILED");
      fail("STT_UNAVAILABLE", "Live voice is unavailable right now.", { retryable: true });
    }
  },
});
