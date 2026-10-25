// POST /voice/agent: the voice assistant's streamed reply (see voiceAgent.ts for the protocol).
// An HTTP action so the reply streams to the browser as Claude writes it; a plain action would
// wait for the whole reply. Signed-in users only (Convex Auth bearer token), rate limited.
import { getAuthUserId } from "@convex-dev/auth/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { errorBody } from "../lib/errors";
import { aiEnabled } from "./claude";
import { parseRequest, replyLines } from "./voiceAgent";

const CALLS_PER_HOUR = 900; // spoken requests that need the assistant (most are matched locally)

// Browsers on the app's own origin (or local development) may call this.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin && (origin === process.env.SITE_URL || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return allowed
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });

export const preflight = httpAction(async (_ctx, req) => new Response(null, { status: 204, headers: corsHeaders(req) }));

export const reply = httpAction(async (ctx, req) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return json(req, 401, errorBody("UNAUTHENTICATED", "Please log in to continue."));
  if (!aiEnabled()) return json(req, 503, errorBody("UPSTREAM_UNAVAILABLE", "The assistant is unavailable.", false));
  const ok = await ctx.runMutation(internal.lib.rateLimit.hit, { userId, kind: "voiceAgent", limit: CALLS_PER_HOUR, windowMs: 60 * 60 * 1000 });
  if (!ok) return json(req, 429, errorBody("RATE_LIMITED", "The assistant needs a short break.", true));
  const request = parseRequest(await req.json().catch(() => null));
  if (!request) return json(req, 400, errorBody("VALIDATION", "That request could not be read."));

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of replyLines(request, abort.signal)) controller.enqueue(encoder.encode(text));
      } catch {
        // Log the class only, never what was said.
        console.warn("voiceAgent: STREAM_FAILED");
        controller.enqueue(encoder.encode("\nERROR\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort(); // the person spoke again: stop generating
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(req) },
  });
});
