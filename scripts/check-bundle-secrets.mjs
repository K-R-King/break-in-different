// Fails if any secret value from .env / .env.docker / .env.local / agent/.env appears in dist/.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_KEYS = /(KEY|SECRET|TOKEN|PRIVATE|JWKS)/;
const values = [];
for (const f of [".env", ".env.docker", ".env.local", "agent/.env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1).trim();
    if (SECRET_KEYS.test(k) && v.length >= 12) values.push([k, v]);
  }
}
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
if (!existsSync("dist")) {
  console.error("dist/ not found: run npm run build first");
  process.exit(1);
}
let leaks = 0;
for (const file of walk("dist")) {
  const text = readFileSync(file, "latin1");
  for (const [k, v] of values) if (text.includes(v)) { console.error(`LEAK: value of ${k} found in ${file}`); leaks++; }
}
console.log(leaks ? `${leaks} leak(s)` : `ok: none of ${values.length} secret values appear in dist/`);
process.exit(leaks ? 1 : 0);
