import { describe, expect, it } from "vitest";
import { comboConflict, comboProblem, formatCombo, matchesCombo, DEFAULT_VOICE_KEY, type Combo } from "./hotkey";

const combo = (code: string, mods: Partial<Omit<Combo, "code">> = {}): Combo => ({ code, ctrl: false, alt: false, shift: false, meta: false, ...mods });

describe("voice shortcut", () => {
  it("formats combos for each platform", () => {
    expect(formatCombo(DEFAULT_VOICE_KEY.combo, false)).toBe("Ctrl+Space");
    expect(formatCombo(combo("KeyK", { alt: true, shift: true }), true)).toBe("Option+Shift+K");
    expect(formatCombo(combo("F2"), false)).toBe("F2");
  });

  it("rejects combos that would fire while typing", () => {
    expect(comboProblem(combo("KeyK"))).not.toBeNull();
    expect(comboProblem(combo("KeyK", { shift: true }))).not.toBeNull();
    expect(comboProblem(combo("Space"))).not.toBeNull();
    expect(comboProblem(combo("Escape", { ctrl: true }))).not.toBeNull();
    expect(comboProblem(combo("F2"))).toBeNull();
    expect(comboProblem(DEFAULT_VOICE_KEY.combo)).toBeNull();
  });

  it("warns about common browser and system shortcuts", () => {
    expect(comboConflict(combo("KeyC", { ctrl: true }), false)).not.toBeNull();
    expect(comboConflict(combo("KeyC", { meta: true }), true)).not.toBeNull();
    expect(comboConflict(combo("Space", { meta: true }), true)).not.toBeNull();
    expect(comboConflict(combo("F5"), false)).not.toBeNull();
    expect(comboConflict(DEFAULT_VOICE_KEY.combo, false)).toBeNull();
    expect(comboConflict(combo("KeyK", { alt: true, shift: true }), false)).toBeNull();
  });

  it("matches only the exact modifiers", () => {
    const e = { code: "Space", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesCombo(e, DEFAULT_VOICE_KEY.combo)).toBe(true);
    expect(matchesCombo({ ...e, shiftKey: true }, DEFAULT_VOICE_KEY.combo)).toBe(false);
  });
});
