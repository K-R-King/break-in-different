// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accommodationsFromRules, classifyRole, experienceFromRules } from "./rules";
import { htmlToText } from "../lib/text";

describe("role family filter", () => {
  it.each([
    ["Full Stack Developer", "full_stack_developer"],
    ["Software Engineer, Full-Stack", "full_stack_developer"],
    ["Senior Backend Engineer", "backend_engineer"],
    ["Frontend Engineer, Platform", "frontend_engineer"],
    ["Machine Learning Engineer", "ml_engineer"],
    ["Research Scientist", "applied_scientist"],
    ["Software Engineer II", "software_engineer"],
    ["Account Executive", null],
    ["Engineering Manager", null],
    ["Product Designer", null],
  ])("%s → %s", (title, family) => expect(classifyRole(title)).toBe(family));
});

describe("rules fallback extraction", () => {
  it("finds an explicit on-site contradiction with a verbatim quote", () => {
    const a = accommodationsFromRules("Great team. This position is on-site five days a week at our Austin facility. Apply now.");
    expect(a[0]).toMatchObject({ code: "remote_work", contradicts: true, quote: "This position is on-site five days a week at our Austin facility." });
  });
  it("finds stated accommodations and experience levels", () => {
    expect(accommodationsFromRules("We are a remote-first company.")[0]).toMatchObject({ code: "remote_work", contradicts: false });
    expect(experienceFromRules("Software Engineer, New Grad", "").level).toBe("new_grad");
    expect(experienceFromRules("Engineer", "You have 5+ years of experience.").level).toBe("experienced");
    expect(experienceFromRules("Engineer", "Build things.").level).toBe("not_stated");
  });
  it("turns listing HTML into readable text", () => {
    expect(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;")).toBe("Hello & welcome\n• One");
  });
});
