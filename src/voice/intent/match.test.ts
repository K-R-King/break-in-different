import { describe, expect, it } from "vitest";
import { alreadyHere, bestMatch, parse, type Candidate } from "./match";

// A small model of the header, the Jobs filters and the settings dialog.
const C: Candidate[] = [
  { id: 1, kind: "link", names: ["Home", "home page"] },
  { id: 2, kind: "link", names: ["Profile", "my profile"] },
  { id: 3, kind: "link", names: ["Jobs Listing", "jobs", "job search"], current: true },
  { id: 4, kind: "link", names: ["Application Tracker", "applications", "tracker", "saved jobs"] },
  { id: 5, kind: "button", names: ["Accessibility settings", "settings"] },
  { id: 10, kind: "group", names: ["Filters"] },
  { id: 11, kind: "group", names: ["Work setup"], parent: 10 },
  { id: 12, kind: "radio", names: ["Remote"], parent: 11 },
  { id: 13, kind: "radio", names: ["On-site or hybrid"], parent: 11 },
  { id: 14, kind: "radio", names: ["Any"], parent: 11 },
  { id: 15, kind: "text", names: ["Location contains"], parent: 10 },
  { id: 16, kind: "group", names: ["Experience level"], parent: 10 },
  { id: 17, kind: "checkbox", names: ["Senior"], parent: 16 },
  { id: 20, kind: "group", names: ["Accessibility settings"], hidden: true },
  { id: 21, kind: "group", names: ["Reading and voice"], parent: 20, hidden: true },
  { id: 22, kind: "checkbox", names: ["Read aloud with word highlighting"], parent: 21, hidden: true },
  { id: 23, kind: "checkbox", names: ["Reduce motion"], parent: 21, hidden: true },
  { id: 24, kind: "group", names: ["Contrast"], parent: 20, hidden: true },
  { id: 25, kind: "radio", names: ["High"], parent: 24, hidden: true },
];

const m = (t: string) => bestMatch(t, C);

describe("parse", () => {
  it("finds the last verb and drops filler", () => {
    expect(parse("please turn on reduce motion")).toEqual({ verb: "on", words: ["reduce", "motion"] });
    expect(parse("go to settings and disable it").verb).toBe("off");
    expect(parse("enable word highlighting when doing tts").words).toEqual(["word", "highlight", "readaloud"]);
  });
});

describe("bestMatch", () => {
  it("matches the example from the brief to the word-highlighting switch", () => {
    expect(m("enable word highlighting when doing tts")).toMatchObject({ id: 22, verb: "on", confident: true });
  });

  it("is as specific as what was said", () => {
    expect(m("job filters")?.id).toBe(10);
    expect(m("show me remote jobs")).toMatchObject({ id: 12, confident: true });
    expect(m("work setup")?.id).toBe(11);
    expect(m("work setup on site")?.id).toBe(13);
    expect(m("remote jobs only")).toMatchObject({ id: 12, confident: true });
    expect(m("show me the job")).toBeNull(); // on the Jobs page, "job" alone is where we are, not "saved jobs"
    expect(alreadyHere("go to jobs", C)?.id).toBe(3);
    expect(alreadyHere("go to jobs filters", C)).toBeNull();
  });

  it("jumps to top-level pages by their everyday names", () => {
    expect(m("go to the application tracker")).toMatchObject({ id: 4, verb: "go", confident: true });
    expect(m("open settings")).toMatchObject({ id: 5, confident: true });
    expect(m("take me home")?.id).toBe(1);
    expect(m("my profile")?.id).toBe(2);
  });

  it("uses group names to narrow down", () => {
    expect(m("high contrast")).toMatchObject({ id: 25, confident: true });
  });

  it("highlights but does not act on chatter that merely contains a keyword", () => {
    const r = m("I was thinking about how remote culture changed everything for engineers");
    expect(r?.id).toBe(12);
    expect(r?.confident).toBe(false);
  });

  it("returns nothing when nothing matches", () => {
    expect(m("hmm")).toBeNull();
    expect(m("banana")).toBeNull();
  });

  it("does not act when two unrelated things fit equally", () => {
    const two: Candidate[] = [
      { id: 1, kind: "button", names: ["Save"] },
      { id: 2, kind: "button", names: ["Save"] },
    ];
    expect(bestMatch("save", two)).toMatchObject({ confident: false, ambiguousWith: 2 });
  });
});
