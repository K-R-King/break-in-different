import { describe, expect, it } from "vitest";
import { parseScroll } from "./scroll";

describe("parseScroll", () => {
  it("understands scrolling commands", () => {
    expect(parseScroll("scroll down")).toEqual({ dir: 1, amount: "page" });
    expect(parseScroll("Scroll up.")).toEqual({ dir: -1, amount: "page" });
    expect(parseScroll("page down please")).toEqual({ dir: 1, amount: "page" });
    expect(parseScroll("scroll down a bit")).toEqual({ dir: 1, amount: "bit" });
    expect(parseScroll("go to the top")).toEqual({ dir: -1, amount: "end" });
    expect(parseScroll("scroll to the bottom")).toEqual({ dir: 1, amount: "end" });
    expect(parseScroll("down")).toEqual({ dir: 1, amount: "page" });
  });

  it("leaves other commands alone", () => {
    expect(parseScroll("go to the tracker")).toBeNull();
    expect(parseScroll("scroll down to the filters and select remote")).toBeNull();
  });
});
