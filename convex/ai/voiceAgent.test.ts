// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CONDITION_LABELS } from "../../shared/taxonomy";
import { buildMessages, JsonToLines, parseRequest, scrub } from "./voiceAgent";

const base = {
  utterance: "make flexible hours preferred",
  page: { path: "/profile", title: "Your profile", hint: "Build your profile.", text: "3. Accommodations you require" },
  guidance: "suggest",
  targets: [
    { id: 1, kind: "radio", label: "Preferred", group: "Flexible working hours", state: "off" },
    { id: 2, kind: "radio", label: "Preferred", group: "Remote work options", state: "off" },
  ],
  history: [
    { role: "user", text: "go to my profile" },
    { role: "assistant", text: "[did: go Profile] Here's your profile." },
  ],
};

describe("voice agent request", () => {
  it("accepts a well-formed request and trims it", () => {
    const r = parseRequest({ ...base, utterance: "x".repeat(2000) })!;
    expect(r.utterance.length).toBe(400);
    expect(r.targets).toHaveLength(2);
    expect(r.guidance).toBe("suggest");
  });

  it("rejects requests without what was said or without controls", () => {
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest({ ...base, utterance: "  " })).toBeNull();
    expect(parseRequest({ ...base, targets: undefined })).toBeNull();
  });

  it("never sends health or disability terms to Claude, wherever they appear", () => {
    const leaky = {
      ...base,
      utterance: "I have ADHD and dyslexia, turn on the font",
      page: { ...base.page, text: "4. Your disability or neurodivergence: Autism, Low vision" },
      targets: [...base.targets, { id: 3, kind: "checkbox", label: "Parkinson's disease", state: "on" }],
      history: [{ role: "user", text: "my diagnosis is Cerebral palsy" }],
    };
    const sent = JSON.stringify(buildMessages(parseRequest(leaky)!)).toLowerCase();
    for (const term of [...Object.values(CONDITION_LABELS), "neurodivergen", "disabilit", "diagnos"]) expect(sent).not.toContain(term.toLowerCase());
    expect(scrub("ADHD")).toBe("[private]");
  });

  it("builds an alternating conversation that ends with this turn and the page", () => {
    const m = buildMessages(parseRequest(base)!);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    const last = m.at(-1)!.content as string;
    expect(last).toContain('1 | radio | "Preferred" | in "Flexible working hours"');
    expect(last).toContain('The person just said: "make flexible hours preferred"');
  });
});

describe("streaming JSON to lines", () => {
  it("passes on each step the moment it is complete, then the reply sentence by sentence", () => {
    const j = new JsonToLines();
    const out: string[] = [];
    const seen: number[] = [];
    const chunks = ['{"steps":[{"do":"type","id":4', '0,"verb":"none","text":"Rust"},', '{"do":"act","id":41,"verb":"press","text":""}', '],"say":"Added Rust. Want ', 'to add another?"}'];
    for (const c of chunks) {
      out.push(...j.push(c));
      seen.push(out.length);
    }
    out.push(...j.end());
    expect(out).toEqual(["TYPE 40 Rust\n", "ACT 41 press\n", "SAY Added Rust.\n", "SAY Want to add another?\n"]);
    expect(seen).toEqual([0, 1, 2, 3, 4]); // nothing waits for the end of the reply
  });

  it("decodes escapes and recovers from a reply it could not follow incrementally", () => {
    const j = new JsonToLines();
    // Keys out of the usual order: the step is only recovered by the full parse at the end.
    const out = [...j.push('{"say":"Say \\"start\\" when ready","steps":[{"id":3,"do":"ask","verb":"press","text":""}]}'), ...j.end()];
    expect(out).toContain('SAY Say "start" when ready\n');
    expect(out).toContain("ASK 3 press\n");
  });
});
