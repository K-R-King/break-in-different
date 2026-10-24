// Runs the integration check (spikes) against the local Convex with the keys pushed from .env.
// Usage: npm run check:integrations [-- claude cartesia apify]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const only = process.argv.slice(2);
const pdfBase64 = readFileSync("tests/fixtures/sample-resume.pdf").toString("base64");
const args = JSON.stringify({ pdfBase64, ...(only.length ? { only } : {}) });
const out = execFileSync("npx", ["convex", "run", "spikes:run", args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const results = JSON.parse(out);
for (const r of results) console.log(`${r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP"}  ${r.check}\n      ${r.detail}`);
process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
