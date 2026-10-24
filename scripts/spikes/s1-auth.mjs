// Spike S1: password sign-up + authenticated query against the self-hosted backend.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
const url = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const c = new ConvexHttpClient(url);
const email = `s1-${Date.now()}@example.com`;
try {
  await c.action(anyApi.auth.signIn, { provider: "password", params: { email, password: "short", flow: "signUp" } });
  console.log("FAIL: short password accepted");
} catch (e) { console.log("short password rejected:", JSON.stringify(e.data ?? e.message).slice(0, 120)); }
const r = await c.action(anyApi.auth.signIn, { provider: "password", params: { email, password: "correct-horse-1", flow: "signUp" } });
console.log("signUp tokens:", !!r.tokens?.token);
c.setAuth(r.tokens.token);
console.log("profiles.get (new user):", await c.query(anyApi.profiles.get, {}));
const anon = new ConvexHttpClient(url);
try { await anon.query(anyApi.profiles.get, {}); console.log("FAIL: anon allowed"); }
catch (e) { console.log("anonymous rejected:", e.data?.code); }
const r2 = await new ConvexHttpClient(url).action(anyApi.auth.signIn, { provider: "password", params: { email, password: "correct-horse-1", flow: "signIn" } });
console.log("signIn tokens:", !!r2.tokens?.token);
