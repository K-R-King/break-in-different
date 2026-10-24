// Integration checks against a running Convex (self-hosted or dev):
//  - unauthenticated calls are rejected
//  - user A cannot read or change user B's drafts or applications
//  - spy: the match request / agent payload contains no disability data and no account IDs
// Usage: AGENT_SHARED_SECRET=... node tests/integration/security.mjs
// Stop the real MatchAgent first (docker compose --env-file .env.docker stop agent): the spy
// test acts as the agent and must be the one that claims the request.
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import assert from "node:assert/strict";

const URL_ = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const SITE = process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211";
const SECRET = process.env.AGENT_SHARED_SECRET;
const iface = { font: "system", textScale: 1, lineHeight: 1.5, letterSpacing: 0, wordSpacing: 0, ttsHighlight: false, voiceReader: false, voiceNav: false, reduceMotion: false, contrast: "standard" };
let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
};

async function user() {
  const c = new ConvexHttpClient(URL_);
  const r = await c.action(api.auth.signIn, { provider: "password", params: { email: `int-${Date.now()}-${Math.random()}@example.com`, password: "correct-horse-1", flow: "signUp" } });
  c.setAuth(r.tokens.token);
  await c.mutation(api.profiles.save, { skills: ["React", "TypeScript"], roleIds: ["full_stack_developer"], requiredAccommodations: ["remote_work"], preferredAccommodations: [], interface: iface, locationText: "", remotePreference: "remote" });
  return c;
}

const anon = new ConvexHttpClient(URL_);
await check("unauthenticated calls are rejected", async () => {
  for (const [kind, fn, args] of [
    ["query", api.profiles.get, {}], ["query", api.matches.list, {}], ["query", api.applications.list, {}],
    ["mutation", api.profiles.save, {}], ["action", api.matches.run, {}], ["mutation", api.account.deleteAll, { confirm: true }],
  ]) {
    await assert.rejects(anon[kind](fn, args), (e) => /UNAUTHENTICATED|ArgumentValidationError|Please log in/.test(String(e.data?.code ?? e.message)));
  }
});

const a = await user();
const b = await user();
await a.action(api.matches.run, {});
const job = (await a.query(api.matches.list, {})).items[0];
const d = await a.action(api.emails.draft, { jobId: job.jobId, accommodationCodes: ["remote_work"], disclose: false, conditions: [], disclosureFreeText: "", extraRequest: "" });
const appId = await a.mutation(api.applications.save, { jobId: job.jobId });

await check("user B cannot read or change user A's draft", async () => {
  await assert.rejects(b.query(api.emails.get, { draftId: d.draftId }), (e) => e.data?.code === "FORBIDDEN");
  await assert.rejects(b.mutation(api.emails.saveEdit, { draftId: d.draftId, subject: "x", body: "y" }), (e) => e.data?.code === "FORBIDDEN");
  await assert.rejects(b.mutation(api.emails.approve, { draftId: d.draftId }), (e) => e.data?.code === "FORBIDDEN");
});
await check("user B cannot change user A's application or see it in their list", async () => {
  await assert.rejects(b.mutation(api.applications.update, { applicationId: appId, status: "rejected" }), (e) => e.data?.code === "FORBIDDEN");
  assert.equal((await b.query(api.applications.list, {})).length, 0);
});

await check("agent endpoints reject a bad secret", async () => {
  const r = await fetch(`${SITE}/agent/claim`, { method: "POST", headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" }, body: JSON.stringify({ agentId: "x" }) });
  assert.equal(r.status, 401);
});

if (SECRET) {
  await check("spy: agent payload has no disability data and no account identifiers", async () => {
    const c = await user();
    await c.mutation(api.profiles.saveSensitive, { selected: ["dyslexia", "adhd"], otherNeuro: "SPY-NEURO-7731", otherDisability: "SPY-DIS-4410" });
    const claim = () => fetch(`${SITE}/agent/claim`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ agentId: "spy" }) }).then((r) => r.json());
    await claim(); // register as alive so the request waits for an agent
    const running = c.action(api.matches.run, {});
    let payload = null;
    for (let i = 0; i < 30 && !payload; i++) {
      await new Promise((r) => setTimeout(r, 250));
      payload = (await claim()).request;
    }
    await running;
    assert.ok(payload, "no request was claimed");
    const text = JSON.stringify(payload).toLowerCase();
    for (const s of ["dyslexia", "adhd", "spy-neuro-7731", "spy-dis-4410", "userid", "@example.com"]) assert.ok(!text.includes(s), `payload contains ${s}`);
    assert.deepEqual(Object.keys(payload.snapshot).sort(), ["locationText", "profileVersion", "remotePreference", "requiredAccommodations", "roleIds", "skills"]);
  });
} else console.log("skip spy test (set AGENT_SHARED_SECRET)");

process.exit(failures ? 1 : 0);
