import { beforeEach, describe, expect, it } from "vitest";
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
