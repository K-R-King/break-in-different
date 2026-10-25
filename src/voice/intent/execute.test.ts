import { describe, expect, it } from "vitest";
import { execute } from "./execute";
import type { Target } from "./scan";

function checkbox(checked: boolean): Target {
  const el = document.createElement("input");
  el.type = "checkbox";
  el.checked = checked;
  document.body.append(el);
  return { id: 0, kind: "checkbox", names: ["Reduce motion"], label: "Reduce motion", el };
}

const on = (t: Target) => (t.el as HTMLInputElement).checked;

describe("execute", () => {
  it("turn on only activates, turn off only deactivates, toggle flips", async () => {
    let t = checkbox(true);
    expect((await execute(t, "on")).changed).toBe(false);
    expect(on(t)).toBe(true);
    t = checkbox(false);
    expect((await execute(t, "off")).changed).toBe(false);
    expect(on(t)).toBe(false);
    t = checkbox(false);
    await execute(t, "on");
    expect(on(t)).toBe(true);
    await execute(t, "off");
    expect(on(t)).toBe(false);
    await execute(t, "toggle");
    expect(on(t)).toBe(true);
    await execute(t, "toggle");
    expect(on(t)).toBe(false);
  });

  it("with no verb only selects and describes", async () => {
    const t = checkbox(false);
    const out = await execute(t, null);
    expect(out.changed).toBe(false);
    expect(on(t)).toBe(false);
    expect(document.activeElement).toBe(t.el);
    expect(out.message).toMatch(/Reduce motion: off/);
  });

  it("never presses a dangerous control", async () => {
    const el = document.createElement("button");
    let clicked = false;
    el.onclick = () => (clicked = true);
    const out = await execute({ id: 0, kind: "button", names: ["Yes, delete everything"], label: "Yes, delete everything", el, danger: true }, "press");
    expect(clicked).toBe(false);
    expect(out.changed).toBe(false);
  });
});
