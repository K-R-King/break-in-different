import { describe, expect, it } from "vitest";
import { afterCorrection, alreadyHere, bestMatch, looseGuess, parse, type Candidate } from "./match";

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
  // The closed settings dialog is merged into its opener (5), which is its controls' context.
  { id: 21, kind: "group", names: ["Reading and voice"], parent: 5, hidden: true },
  { id: 22, kind: "checkbox", names: ["Read aloud with word highlighting"], parent: 21, hidden: true },
  { id: 23, kind: "checkbox", names: ["Reduce motion"], parent: 21, hidden: true },
  { id: 24, kind: "group", names: ["Contrast"], parent: 5, hidden: true },
  { id: 25, kind: "radio", names: ["High"], parent: 24, hidden: true },
];

const m = (t: string) => bestMatch(t, C);

describe("parse", () => {
  it("keeps on, off and toggle distinct", () => {
    expect(parse("enable reduce motion").verb).toBe("on");
    expect(parse("turn on reduce motion").verb).toBe("on");
    expect(parse("I need captions").verb).toBe("on");
    expect(parse("disable reduce motion").verb).toBe("off");
    expect(parse("turn it off").verb).toBe("off");
    expect(parse("I don't need captions").verb).toBe("off");
    expect(parse("toggle reduce motion").verb).toBe("toggle");
    expect(parse("switch to the tracker").verb).toBe("go");
    expect(parse("select remote").verb).toBe("select");
    expect(parse("yes").verb).toBe("do");
    expect(parse("reduce motion").verb).toBeNull();
  });

  it("finds the last verb and drops filler", () => {
    expect(parse("please turn on reduce motion")).toMatchObject({ verb: "on", words: ["reduce", "motion"] });
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

  it("keeps the current guess unless something clearly fits better", () => {
    const two: Candidate[] = [
      { id: 1, kind: "checkbox", names: ["Reduce motion"] },
      { id: 2, kind: "checkbox", names: ["Reduce animations"] },
    ];
    expect(bestMatch("reduce", two)?.ambiguousWith).toBeDefined();
    expect(bestMatch("reduce", two, { sticky: 2 })).toMatchObject({ id: 2 });
    expect(bestMatch("reduce motion", two, { sticky: 2 })?.id).toBe(1);
  });

  it("lets the verb pick between a box and a button with the same words", () => {
    const skill: Candidate[] = [
      { id: 1, kind: "text", names: ["Add a skill"] },
      { id: 2, kind: "button", names: ["Add skill"] },
    ];
    expect(bestMatch("add skill", skill)).toMatchObject({ id: 1, confident: true });
    expect(bestMatch("press add skill", skill)).toMatchObject({ id: 2, confident: true });
  });

  it("prefers the repeated control where the person is working", () => {
    const cards: Candidate[] = [
      { id: 1, kind: "group", names: ["Junior Engineer"] },
      { id: 2, kind: "button", names: ["Save"], parent: 1 },
      { id: 3, kind: "group", names: ["Senior Engineer"] },
      { id: 4, kind: "button", names: ["Save"], parent: 3 },
    ];
    expect(bestMatch("save", cards)?.confident).toBe(false);
    expect(bestMatch("press save", cards, { context: new Set([3]) })).toMatchObject({ id: 4, confident: true });
    expect(bestMatch("press save on junior engineer", cards, { context: new Set([3]) })?.id).toBe(2);
  });

  it("never picks the opposite of what was said", () => {
    const header: Candidate[] = [
      { id: 1, kind: "button", names: ["Log out"] },
      { id: 2, kind: "text", names: ["Add a skill"] },
      { id: 3, kind: "button", names: ["Remove TypeScript"] },
      { id: 4, kind: "button", names: ["Next job"] },
      { id: 5, kind: "button", names: ["Previous job"] },
      { id: 6, kind: "button", names: ["Show or hide"] },
    ];
    expect(bestMatch("log in", header)).toBeNull();
    expect(bestMatch("sign in", header)).toBeNull();
    expect(bestMatch("log out", header)?.id).toBe(1);
    expect(bestMatch("sign out", header)?.id).toBe(1);
    expect(bestMatch("add typescript", header)?.id).not.toBe(3);
    expect(bestMatch("remove typescript", header)?.id).toBe(3);
    expect(bestMatch("previous", header)?.id).toBe(5);
    expect(bestMatch("prev job", header)?.id).toBe(5);
    expect(bestMatch("hide", header)?.id).toBe(6); // names both sides: never ruled out
  });

  it("follows the latest keywords", () => {
    const voice: Candidate[] = [
      { id: 1, kind: "checkbox", names: ["Voice control"] },
      { id: 2, kind: "checkbox", names: ["Voice reader"] },
    ];
    // While the old guess is still shown (sticky), the newest keyword moves it at once.
    expect(bestMatch("voice controls voice reader", voice, { sticky: 1 })?.id).toBe(2);
    expect(bestMatch("voice control", voice, { sticky: 1 })?.id).toBe(1);
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

describe("afterCorrection", () => {
  it("keeps only what follows a correction", () => {
    expect(afterCorrection("voice controls wait voice reader")).toBe("voice reader");
    expect(afterCorrection("remote, no, on site")).toBe("on site");
    expect(afterCorrection("go to jobs actually go to the tracker")).toBe("go to the tracker");
    expect(afterCorrection("not needed")).toBe("not needed"); // "no" inside a name is not a correction
    expect(afterCorrection("turn on remote wait")).toBe("turn on remote wait"); // nothing after it yet: kept ("wait" is filler)
  });
});

describe("looseGuess", () => {
  it("highlights whatever the newest keyword names, among what is on screen", () => {
    const c: Candidate[] = [
      { id: 1, kind: "checkbox", names: ["Voice control"], inView: true },
      { id: 2, kind: "checkbox", names: ["Voice reader"], inView: true },
      { id: 3, kind: "checkbox", names: ["Reader mode"], inView: false },
    ];
    expect(looseGuess("voice", c)).not.toBeNull();
    expect(looseGuess("voice controls wait reader", c)).toBe(2);
  });
});

describe("simple: only the control's own name, so it is done locally", () => {
  const c: Candidate[] = [
    { id: 1, kind: "group", names: ["Remote work options"] },
    { id: 2, kind: "radio", names: ["Not needed"], parent: 1 },
    { id: 3, kind: "button", names: ["Refresh matches"] },
  ];
  it("a name, maybe with a verb, is simple", () => {
    expect(bestMatch("refresh the matches", c)?.simple).toBe(true);
    expect(m("turn on reduce motion")?.simple).toBe(true);
    expect(m("go to my profile")?.simple).toBe(true);
  });
  it("anything said in context is not, so the assistant interprets it", () => {
    expect(bestMatch("Remote work options should be Not needed", c)).toMatchObject({ id: 2, simple: false });
  });
});

describe("action words in a control's name", () => {
  const c: Candidate[] = [
    { id: 1, kind: "button", names: ["Refresh matches"] },
    { id: 2, kind: "button", names: ["Save", "save profile"] },
    { id: 3, kind: "button", names: ["Accessibility settings", "settings"] },
    { id: 4, kind: "text", names: ["Add a skill"] },
    { id: 5, kind: "button", names: ["Add skill"] },
  ];
  it("are the verb: saying one is a request to do it", () => {
    expect(bestMatch("refresh the matches", c)).toMatchObject({ id: 1, verb: "press", confident: true });
    expect(bestMatch("Refresh.", c)).toMatchObject({ id: 1, verb: "press" });
    expect(bestMatch("save my profile", c)).toMatchObject({ id: 2, verb: "press" });
  });
  it("a verb that starts a button's name presses it", () => {
    const pdf: Candidate[] = [...c, { id: 6, kind: "button", names: ["Choose a PDF", "upload resume"] }];
    expect(bestMatch("choose a PDF", pdf)).toMatchObject({ id: 6, verb: "press" });
  });
  it("a name that is not an action only selects", () => {
    expect(bestMatch("settings", c)).toMatchObject({ id: 3, verb: null });
    expect(bestMatch("matches", c)).toMatchObject({ id: 1, verb: null });
  });
  it("still leaves a text box to type in when its name says so", () => {
    expect(bestMatch("add a skill", c)).toMatchObject({ id: 4, verb: null });
  });
});

