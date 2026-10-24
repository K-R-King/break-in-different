import { describe, expect, it } from "vitest";
import { resolveVerbOnly, type Resolvable } from "./resolve";

const C: Resolvable[] = [
  { id: 0, kind: "group", names: ["Reading and voice"] },
  { id: 1, kind: "checkbox", names: ["Read aloud with word highlighting"], parent: 0, checked: true },
  { id: 2, kind: "checkbox", names: ["Reduce motion"], parent: 0, checked: false },
  { id: 3, kind: "group", names: ["Work setup"] },
  { id: 4, kind: "radio", names: ["Remote"], parent: 3, checked: false },
  { id: 5, kind: "radio", names: ["Any"], parent: 3, checked: true },
  { id: 6, kind: "link", names: ["Profile"] },
  { id: 7, kind: "group", names: ["Experience level"] },
  { id: 8, kind: "checkbox", names: ["Internship"], parent: 7, checked: false },
  { id: 9, kind: "checkbox", names: ["New grad"], parent: 7, checked: false },
];

describe("resolveVerbOnly", () => {
  it("applies to the selected control when the verb fits it", () => {
    expect(resolveVerbOnly("on", 2, C)).toEqual({ act: 2 });
    expect(resolveVerbOnly("toggle", 1, C)).toEqual({ act: 1 });
  });

  it("in a selected region, picks the only control the verb would change", () => {
    expect(resolveVerbOnly("on", 0, C)).toEqual({ act: 2 }); // only Reduce motion is off
    expect(resolveVerbOnly("off", 0, C)).toEqual({ act: 1 }); // only word highlighting is on
    expect(resolveVerbOnly("select", 3, C)).toEqual({ act: 4 }); // Remote is the one not chosen
  });

  it("asks which one when several fit", () => {
    expect(resolveVerbOnly("on", 7, C)).toEqual({ ask: 7, options: [8, 9] });
    expect(resolveVerbOnly("toggle", 0, C)).toEqual({ ask: 0, options: [1, 2] });
  });

  it("looks outward from a selected control the verb does not fit", () => {
    // A radio cannot be turned off; nothing else in Work setup can be either.
    expect(resolveVerbOnly("off", 4, C)).toBeNull();
    expect(resolveVerbOnly("on", 6, C)).toBeNull(); // a link is not a switch, and has no region
  });
});
