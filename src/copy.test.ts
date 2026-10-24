// A8: no interface text says an employer does not or cannot provide an accommodation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_PHRASES, COPY } from "./copy";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("no false negatives in interface copy", () => {
  it("copy.ts has no banned phrases", () => {
    const text = JSON.stringify(COPY);
    for (const re of BANNED_PHRASES) expect(text).not.toMatch(re);
  });
  it("no source file under src/ or shared/fixtures has banned phrases", () => {
    for (const f of [...files("src"), ...files("shared/fixtures")]) {
      if (f.endsWith("copy.ts")) continue;
      const text = readFileSync(f, "utf8");
      for (const re of BANNED_PHRASES) expect(`${f}: ${text.match(re)?.[0] ?? ""}`).toBe(`${f}: `);
    }
  });
});
