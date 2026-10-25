import { describe, expect, it } from "vitest";
import { parseScroll } from "./scroll";

describe("parseScroll", () => {
  it("understands scrolling commands", () => {
    expect(parseScroll("scroll down")).toEqual({ dir: 1, amount: "step" });
    expect(parseScroll("Scroll up.")).toEqual({ dir: -1, amount: "step" });
    expect(parseScroll("page down please")).toEqual({ dir: 1, amount: "page" });
    expect(parseScroll("scroll down a bit")).toEqual({ dir: 1, amount: "bit" });
    expect(parseScroll("go to the top")).toEqual({ dir: -1, amount: "end" });
    expect(parseScroll("scroll to the bottom")).toEqual({ dir: 1, amount: "end" });
    expect(parseScroll("down")).toEqual({ dir: 1, amount: "step" });
  });

  it("ignores hesitations and repeats", () => {
    expect(parseScroll("Uh, scroll down")).toEqual({ dir: 1, amount: "step" });
    expect(parseScroll("um, uh, scroll up a bit")).toEqual({ dir: -1, amount: "bit" });
    expect(parseScroll("Uh scroll down, scroll down. Scroll down.")).toEqual({ dir: 1, amount: "step" });
    expect(parseScroll("scroll down, no, scroll up")).toBeNull(); // a correction is not filler
    expect(parseScroll("scroll down. Scroll up.")).toEqual({ dir: -1, amount: "step" }); // the last one said
    expect(parseScroll("uh, down")).toEqual({ dir: 1, amount: "step" });
    expect(parseScroll("I scroll down.")).toEqual({ dir: 1, amount: "step" }); // "uh" as heard by speech-to-text
    expect(parseScroll("can you scroll down please")).toEqual({ dir: 1, amount: "step" });
    expect(parseScroll("I want to scroll up a little")).toEqual({ dir: -1, amount: "bit" });
    expect(parseScroll("let me scroll to the bottom")).toEqual({ dir: 1, amount: "end" });
  });

  it("leaves other commands alone", () => {
    expect(parseScroll("go to the tracker")).toBeNull();
    expect(parseScroll("scroll down to the filters and select remote")).toBeNull();
  });
});
