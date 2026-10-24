// @vitest-environment node
// Spy test (privacy): disability selections never reach Claude prompts, and only the
// profile/account code can read the sensitiveProfiles table.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONDITION_LABELS } from "../../shared/taxonomy";

const calls: unknown[] = [];
vi.mock("./claude", () => ({
  aiEnabled: () => true,
  asData: (_l: string, t: string) => t,
  structuredCall: vi.fn(async (opts: unknown) => {
    calls.push(opts);
    return null;
  }),
}));

const { draftEmailWithClaude, explainMatches, extractListing, extractResumeSkills } = await import("./prompts");
const SENSITIVE = [...Object.values(CONDITION_LABELS), "neurodivergen", "disabilit", "diagnos"].map((s) => s.toLowerCase());

beforeEach(() => {
  calls.length = 0;
});

describe("no disability data in any Claude prompt", () => {
  it("email drafting with disclosure on still sends no condition to Claude", async () => {
    await draftEmailWithClaude({ jobTitle: "Full Stack Developer", employerName: "Lumen Health Tech", codes: ["remote_work", "assistive_software"], disclose: true });
    // Check the data sent (content), not the system rules that forbid health terms.
    const sent = JSON.stringify(calls.map((c) => (c as { content: unknown }).content)).toLowerCase();
    for (const s of SENSITIVE) expect(sent).not.toContain(s);
  });
  it("explanations send factor data only", async () => {
    await explainMatches([{ id: "m1", score: 90, factors: { skills: { ratio: 1, matched: ["React"], missing: [], limitedInfo: false }, role: { type: "exact" }, location: { fit: 1, reason: "job is remote" }, conflicts: [] } }]);
    const sent = JSON.stringify(calls);
    expect(sent).not.toMatch(/userId|email|profile/i);
  });
  it("listing and resume extraction prompts take only text inputs", async () => {
    await extractListing("Engineer", "Build things.");
    await extractResumeSkills({ text: "React, TypeScript" });
    expect(calls).toHaveLength(2);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (p.includes("_generated")) return [];
    return statSync(p).isDirectory() ? files(p) : f.endsWith(".ts") && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("sensitiveProfiles is isolated", () => {
  it("only profiles.ts, account.ts and schema.ts mention the table", () => {
    const users = files("convex").filter((f) => readFileSync(f, "utf8").includes("sensitiveProfiles"));
    expect(users.sort()).toEqual(["convex/account.ts", "convex/profiles.ts", "convex/schema.ts"]);
  });
  it("matching and agent code never touch it", () => {
    for (const f of ["convex/matches.ts", "convex/match/scorer.ts", "convex/http.ts", "agent/main.py", "agent/scorer.py"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/sensitiveProfiles|CONDITION|conditions|getSensitive/);
    }
  });
});
