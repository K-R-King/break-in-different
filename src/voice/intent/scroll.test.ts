import { describe, expect, it, vi } from "vitest";
import { parseScroll, scrollPage } from "./scroll";

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

describe("scrollPage", () => {
  // A scrolling column, as jsdom has no layout.
  const column = (height: number) => {
    const el = document.createElement("div");
    el.style.overflowY = "auto";
    Object.defineProperty(el, "scrollHeight", { value: height * 4 });
    Object.defineProperty(el, "clientHeight", { value: height });
    el.getBoundingClientRect = () => ({ top: 0, bottom: height, left: 0, right: 400, width: 400, height, x: 0, y: 0, toJSON: () => ({}) });
    el.scrollBy = vi.fn();
    document.body.append(el);
    return el;
  };

  it("scrolls a column layout when the window itself does not scroll", () => {
    document.body.style.overflowY = "hidden";
    document.elementFromPoint = () => null; // nothing covers the edges
    const side = column(300);
    const list = column(500);
    const main = column(400);
    const job = document.createElement("section");
    job.setAttribute("data-voice-primary", "");
    main.append(job);
    // Nothing selected: the column holding the page's main region.
    expect(scrollPage({ dir: 1, amount: "step" }, document.body)).toBe("Scrolled down.");
    expect(main.scrollBy).toHaveBeenCalled();
    job.remove();
    // No main region: the largest column on screen.
    scrollPage({ dir: 1, amount: "step" }, document.body);
    expect(list.scrollBy).toHaveBeenCalled();
    expect(side.scrollBy).not.toHaveBeenCalled();
    for (const el of [side, list, main]) el.remove();
    document.body.style.overflowY = "";
  });
});

