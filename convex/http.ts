import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { errorBody } from "./lib/errors";
import * as voiceAgent from "./ai/voiceAgentHttp";

const VERSION = "0.1.0";
const http = httpRouter();
auth.addHttpRoutes(http);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function authorized(req: Request): boolean {
  const secret = process.env.AGENT_SHARED_SECRET;
  const header = req.headers.get("Authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = header.slice(7);
  // Constant-time comparison.
  let diff = given.length ^ secret.length;
  for (let i = 0; i < Math.max(given.length, secret.length); i++)
    diff |= (given.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  return diff === 0;
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json(200, { status: "ok", version: VERSION })),
});

http.route({
  path: "/agent/claim",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json(401, errorBody("UNAUTHENTICATED", "Bad agent secret."));
    const body = (await req.json().catch(() => null)) as { agentId?: unknown } | null;
    if (!body || typeof body.agentId !== "string" || body.agentId.length > 64)
      return json(400, errorBody("VALIDATION", "agentId is required."));
    const out = await ctx.runMutation(internal.matches.claimNext, { agentId: body.agentId });
    if ("rateLimited" in out) return json(429, errorBody("RATE_LIMITED", "Polling too fast.", true));
    return json(200, out);
  }),
});

http.route({
  path: "/agent/result",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json(401, errorBody("UNAUTHENTICATED", "Bad agent secret."));
    const body = (await req.json().catch(() => null)) as { requestId?: unknown; engine?: unknown; results?: unknown } | null;
    if (!body || typeof body.requestId !== "string" || body.engine !== "uagent" || !Array.isArray(body.results))
      return json(400, errorBody("VALIDATION", "Body does not match the result schema."));
    try {
      const out = await ctx.runMutation(internal.matches.storeAgentResults, {
        requestId: body.requestId,
        results: body.results as never,
      });
      if (out.status === 404) return json(404, errorBody("NOT_FOUND", "Unknown request."));
      if (out.status === 409) return json(409, errorBody("VALIDATION", "Request already completed."));
      if (out.status === 400) return json(400, errorBody("VALIDATION", "Results reference jobs outside the request."));
      return json(200, { ok: true });
    } catch {
      // Argument validation failed inside Convex: the payload shape is wrong.
      return json(400, errorBody("VALIDATION", "Body does not match the result schema."));
    }
  }),
});

// Voice assistant: streamed replies (convex/ai/voiceAgentHttp.ts).
http.route({ path: "/voice/agent", method: "POST", handler: voiceAgent.reply });
http.route({ path: "/voice/agent", method: "OPTIONS", handler: voiceAgent.preflight });

for (const path of ["/health", "/agent/claim", "/agent/result"]) {
  http.route({ path, method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204 })) });
}

export default http;
