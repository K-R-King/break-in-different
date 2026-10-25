import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { highlights, shown } from "./highlight";

const el = () => document.body.appendChild(document.createElement("button"));
const visible = () => shown(highlights.get()).map((h) => `${h.state}:${h.label}`);

describe("highlights", () => {
  beforeEach(() => highlights.clearAll());

  it("shows exactly one green at a time", () => {
    const profile = el();
    const name = el();
    highlights.doing(profile, "Go to: Profile");
    highlights.done(profile, "Opened Profile.");
    expect(visible()).toEqual(["done:Opened Profile."]);

    // "name": the guess replaces the selection on screen.
    highlights.guess(name, "Full name");
    expect(visible()).toEqual(["guess:Full name"]);

    // Acting on it makes it the new selection; the old one is gone.
    highlights.doing(name, "Full name");
    expect(visible()).toEqual(["doing:Full name"]);
    highlights.done(name, "Full name. Ready for input.");
    expect(visible()).toEqual(["done:Full name. Ready for input."]);
    expect(highlights.get()).toHaveLength(1);
  });

  it("brings the selection back when a guess is dropped unused", () => {
    const a = el();
    highlights.done(a, "Reduce motion: off.");
    highlights.guess(el(), "Remote", "unsure");
    expect(visible()).toEqual(["unsure:Remote"]);
    highlights.clearGuess();
    expect(visible()).toEqual(["done:Reduce motion: off."]);
  });
});

describe("highlights go away when something new starts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    highlights.clearAll();
  });
  afterEach(() => vi.useRealTimers());

  it("fades a finished or waiting highlight after 3 seconds with nothing new", () => {
    highlights.done(el(), "Saved.");
    vi.advanceTimersByTime(2900);
    expect(highlights.get()[0].fading).toBeFalsy();
    vi.advanceTimersByTime(200);
    expect(highlights.get()[0].fading).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(highlights.get()).toHaveLength(0);

    highlights.guess(el(), "Remote", "unsure");
    vi.advanceTimersByTime(3100);
    expect(highlights.get()[0].fading).toBe(true);
  });

  it("restarts the wait when a newer highlight replaces it", () => {
    highlights.done(el(), "First.");
    vi.advanceTimersByTime(2000);
    highlights.done(el(), "Second.");
    vi.advanceTimersByTime(2000);
    expect(visible()).toEqual(["done:Second."]);
    expect(highlights.get()[0].fading).toBeFalsy();
  });

  it("dismiss() clears everything except an action still running", () => {
    highlights.done(el(), "Saved.");
    highlights.doing(el(), "Press: Apply");
    highlights.dismiss();
    expect(highlights.get().filter((h) => !h.fading).map((h) => h.state)).toEqual(["doing"]);
  });
});
