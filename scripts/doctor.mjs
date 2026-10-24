// Checks that every required variable exists (names only; values are never printed).
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const parse = (f) =>
  existsSync(f)
    ? Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
    : null;
let ok = true;
const report = (name, present, required) => {
  console.log(`${present ? "ok     " : required ? "MISSING" : "unset  "} ${name}${!present && !required ? " (optional: fallback is used)" : ""}`);
  if (!present && required) ok = false;
};

const docker = parse(".env.docker");
if (docker) {
  console.log("== .env.docker (Docker Compose demo)");
  for (const k of ["CONVEX_INSTANCE_SECRET", "AGENT_SHARED_SECRET"]) report(k, !!docker[k], true);
  report("CONVEX_SELF_HOSTED_ADMIN_KEY", !!docker.CONVEX_SELF_HOSTED_ADMIN_KEY, false);
}
const keys = parse(".env");
console.log("== .env (sponsor API keys)");
if (!keys) console.log("missing: copy .env.example to .env");
for (const k of ["ANTHROPIC_API_KEY", "CARTESIA_API_KEY", "APIFY_TOKEN"]) report(k, !!keys?.[k], false);
if (keys?.MOCK_AI) console.log("note   MOCK_AI is set: every integration uses its fallback");
const local = parse(".env.local");
if (local) {
  console.log("== .env.local (npm run dev)");
  for (const k of ["VITE_CONVEX_URL", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]) report(k, !!local[k], true);
  try {
    const names = execSync("npx convex env list", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    console.log("== Convex server environment");
    for (const k of ["JWT_PRIVATE_KEY", "JWKS", "SITE_URL", "AGENT_SHARED_SECRET"]) report(k, new RegExp(`^${k}`, "m").test(names), true);
    for (const k of ["ANTHROPIC_API_KEY", "CARTESIA_API_KEY", "APIFY_TOKEN"]) report(k, new RegExp(`^${k}`, "m").test(names), false);
  } catch {
    console.log("could not reach Convex (is the backend running?)");
    ok = false;
  }
}
if (!docker && !local) {
  console.log("No .env.docker or .env.local found. Run ./scripts/demo.sh init (Docker) or see README.");
  ok = false;
}
process.exit(ok ? 0 : 1);
