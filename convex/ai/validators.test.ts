// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailIsValid, explanationIsGrounded, practiceLineIsValid, redactHealthTerms, verifyAccommodations } from "./validators";
import { disclosureText, emailTemplate, fillTokens, scriptedPracticeTurn } from "./templates";
import type { MatchFactors } from "../../shared/types";

const listing = `This role is fully remote for candidates anywhere in the US.
Core hours are 11am–3pm ET.  Plan the rest of your day around your life.`;

describe("evidence check (guardrail 2, A7)", () => {
  it("keeps verbatim quotes after whitespace and dash normalization", () => {
    const out = verifyAccommodations(
      [{ code: "flexible_hours", quote: "Core hours are 11am-3pm ET. Plan the rest of your day around your life.", kind: "stated", contradicts: false }],
      listing,
    );
    expect(out).toEqual([expect.objectContaining({ code: "flexible_hours", label: "stated" })]);
  });
  it("drops quotes that are not in the listing", () => {
    const out = verifyAccommodations([{ code: "remote_work", quote: "Work from anywhere in the world, forever.", kind: "stated", contradicts: false }], listing);
    expect(out).toEqual([]);
  });
  it("turns boilerplate into Unverified and never duplicates a code", () => {
    const out = verifyAccommodations(
      [
        { code: "remote_work", quote: "This role is fully remote for candidates anywhere in the US.", kind: "ambiguous", contradicts: false },
        { code: "remote_work", quote: "This role is fully remote for candidates anywhere in the US.", kind: "stated", contradicts: false },
      ],
      listing,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("unverified");
  });
  it("every Stated label carries a quote found in the text", () => {
    const out = verifyAccommodations([{ code: "remote_work", quote: "This role is fully remote for candidates anywhere in the US.", kind: "stated", contradicts: false }], listing);
    for (const a of out.filter((x) => x.label === "stated")) expect(listing).toContain(a.evidence!);
  });
});

describe("explanation check (guardrail 3)", () => {
  const f: MatchFactors = {
    skills: { ratio: 0.88, matched: ["React", "TypeScript"], missing: ["Kubernetes"], limitedInfo: false },
    role: { type: "exact" },
    location: { fit: 1, reason: "job is remote" },
    conflicts: [],
  };
  it("accepts text grounded in the factor data", () => {
    expect(explanationIsGrounded("Matches React and TypeScript (2 of 3 skills); missing Kubernetes. Exact role match and the job is remote.", f, 93)).toBe(true);
  });
  it("rejects invented numbers or skills", () => {
    expect(explanationIsGrounded("Matches 7 of 9 skills.", f, 93)).toBe(false);
    expect(explanationIsGrounded("Strong Python and Docker experience.", f, 93)).toBe(false);
  });
});

describe("email validator (guardrail 4, A10, A11)", () => {
  const base = { subject: "Accommodation request", body: "Hello,\n\nI'd like to ask about remote work options and flexible working hours.\n\nMy application: [APPLICATION_LINK]\n\nThank you,\n[Your name]" };
  it("accepts a draft naming exactly the chosen accommodations", () => {
    expect(emailIsValid(base, ["remote_work", "flexible_hours"], false)).toBe(true);
  });
  it("rejects missing or extra accommodations", () => {
    expect(emailIsValid(base, ["remote_work"], false)).toBe(false);
    expect(emailIsValid(base, ["remote_work", "flexible_hours", "quiet_workspace"], false)).toBe(false);
  });
  it("rejects any health term written by the model", () => {
    expect(emailIsValid({ ...base, body: base.body.replace("Hello,", "Hello, as someone with ADHD,") }, ["remote_work", "flexible_hours"], false)).toBe(false);
    expect(emailIsValid({ ...base, body: base.body.replace("Hello,", "Because of my disability,") }, ["remote_work", "flexible_hours"], false)).toBe(false);
  });
  it("requires the disclosure token exactly when disclosure is on, and no URLs", () => {
    expect(emailIsValid(base, ["remote_work", "flexible_hours"], true)).toBe(false);
    expect(emailIsValid({ ...base, body: base.body.replace("Hello,", "Hello,\n\n[DISCLOSURE]") }, ["remote_work", "flexible_hours"], true)).toBe(true);
    expect(emailIsValid({ ...base, body: base.body + "\nhttps://evil.example" }, ["remote_work", "flexible_hours"], false)).toBe(false);
  });
  it("ignores words inside the job title and employer name", () => {
    const b = { ...base, subject: "Remote Health Co: accommodation request" };
    expect(emailIsValid(b, ["remote_work", "flexible_hours"], false, ["Remote Health Co"])).toBe(true);
  });
  it("the fixed template passes its own validator", () => {
    for (const disclose of [false, true]) {
      const t = emailTemplate({ jobTitle: "Full Stack Developer", employerName: "Lumen Health Tech", codes: ["remote_work", "written_alternatives", "assistive_software"], disclose });
      expect(emailIsValid(t, ["remote_work", "written_alternatives", "assistive_software"], disclose, ["Full Stack Developer", "Lumen Health Tech"])).toBe(true);
    }
  });
  it("disclosure text comes only from the user's selection or words (A11)", () => {
    const t = emailTemplate({ jobTitle: "Dev", employerName: "Acme", codes: ["remote_work"], disclose: true });
    const body = fillTokens(t.body, "https://example.com/apply", disclosureText(["Dyslexia"], ""));
    expect(body).toContain("I'd like to share that I have Dyslexia.");
    expect(body).toContain("https://example.com/apply");
    expect(body).not.toContain("[DISCLOSURE]");
    const off = fillTokens(emailTemplate({ jobTitle: "Dev", employerName: "Acme", codes: ["remote_work"], disclose: false }).body, "u", "");
    expect(off).not.toMatch(/dyslexia|disab|condition/i);
    expect(disclosureText(["Dyslexia"], "I process written information best.")).toBe("I process written information best.");
  });
  it("inserts the user's extra request verbatim before the link", () => {
    const body = fillTokens("Hi\n\nMy application: [APPLICATION_LINK]", "URL", "", "a standing desk");
    expect(body).toBe("Hi\n\nI would also like to ask about: a standing desk\n\nMy application: URL");
  });
});

describe("interview practice guardrails", () => {
  it("removes condition words from answers, whatever the case, and keeps everything else", () => {
    expect(redactHealthTerms("I have ADHD. My Dyslexia means I like written notes; I'm autistic."))
      .toBe("I have [removed]. My [removed] means I like written notes; I'm [removed].");
    expect(redactHealthTerms("Parkinson's disease runs in my family")).toBe("[removed] runs in my family");
    expect(redactHealthTerms("I built a dashboard in React with blinding speed")).toBe("I built a dashboard in React with blinding speed");
  });
  it("accepts a short interviewer line and rejects links, health words and long text", () => {
    expect(practiceLineIsValid("Thanks. Tell me about a project where you used React.")).toBe(true);
    expect(practiceLineIsValid("Do you have a disability we should know about?")).toBe(false);
    expect(practiceLineIsValid("Is your ADHD under control?")).toBe(false);
    expect(practiceLineIsValid("See https://example.com for details.")).toBe(false);
    expect(practiceLineIsValid("x".repeat(701))).toBe(false);
    // A greeting that repeats a long job title still fits.
    expect(practiceLineIsValid(`Hello, and welcome to this practice interview for the Senior Machine Learning Engineer, Drive role at DoorDash. We have about 4 questions and there is no time limit, so take whatever time you need. To start, could you tell me about a machine learning model you built and deployed, what problem it solved, and what your part in it was?`)).toBe(true);
    expect(practiceLineIsValid("   ")).toBe(false);
  });
  it("scripted interviewer asks every question once, then closes", () => {
    const base = { jobTitle: "Full Stack Developer", skills: ["React"] };
    const start = scriptedPracticeTurn({ ...base, answered: 0, move: "start" });
    expect(start.say).toContain("Tell me about yourself");
    expect(scriptedPracticeTurn({ ...base, answered: 1, move: "answer" }).say).toContain("React");
    expect(scriptedPracticeTurn({ ...base, answered: 3, move: "answer" }).kind).toBe("question");
    expect(scriptedPracticeTurn({ ...base, answered: 4, move: "answer" }).kind).toBe("closing");
    expect(scriptedPracticeTurn({ ...base, answered: 1, move: "rephrase" }).say).toMatch(/^Let me ask that another way/);
    for (const n of [0, 1, 2, 3, 4]) expect(practiceLineIsValid(scriptedPracticeTurn({ ...base, answered: n, move: "answer" }).say)).toBe(true);
  });
});
