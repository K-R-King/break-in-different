import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("runs a voice-only command when said", async () => {
    let ran = 0;
    const el = document.body;
    const out = await execute({ id: 0, kind: "button", names: ["Next job"], label: "Next job", el, command: true, run: () => ran++, message: "Moved." }, null);
    expect(ran).toBe(1);
    expect(out).toMatchObject({ changed: true, message: "Moved." });
  });

  it("chooses a dropdown option only with a verb", async () => {
    let ran = 0;
    const el = document.body.appendChild(document.createElement("select"));
    const t = { id: 0, kind: "radio" as const, names: ["Interviewing"], label: "Status: Interviewing", el, run: () => ran++ };
    expect((await execute(t, null)).changed).toBe(false);
    expect(ran).toBe(0);
    await execute(t, "select");
    expect(ran).toBe(1);
  });

  it("turns a toggle command only the way its name says", async () => {
    const el = document.body.appendChild(document.createElement("button"));
    el.setAttribute("aria-pressed", "false");
    el.onclick = () => el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
    const save = { id: 0, kind: "button" as const, names: ["Save this job"], label: "Save", el, command: true, commandWay: "on" as const };
    await execute(save, null);
    expect(el.getAttribute("aria-pressed")).toBe("true");
    await execute(save, null); // saying "save" again never unsaves
    expect(el.getAttribute("aria-pressed")).toBe("true");
    await execute({ ...save, commandWay: "off" }, null);
    expect(el.getAttribute("aria-pressed")).toBe("false");
  });

  describe("links", () => {
    afterEach(() => vi.restoreAllMocks());
    const link = (label: string, newTab: boolean): Target => {
      const el = document.createElement("a");
      el.href = "https://employer.example/apply";
      if (newTab) el.target = "_blank";
      el.textContent = label;
      document.body.append(el);
      return { id: 0, kind: "link", names: [label], label, el };
    };

    it("opens a new-tab link itself, since browsers block a scripted click, and still runs its handler", async () => {
      const tab = { opener: window } as unknown as Window;
      const open = vi.spyOn(window, "open").mockReturnValue(tab);
      const t = link("Open application page", true);
      let handled = false;
      let followed = true;
      t.el.addEventListener("click", (e) => {
        handled = true;
        queueMicrotask(() => (followed = !e.defaultPrevented));
      });
      const out = await execute(t, "go");
      await Promise.resolve();
      expect(handled).toBe(true);
      expect(followed).toBe(false); // the blocked native click is not attempted as well
      expect(open).toHaveBeenCalledWith("https://employer.example/apply", "_blank");
      expect(tab.opener).toBeNull();
      expect(out.message).toBe("Opened application page in a new tab.");
    });

    it("never says the verb twice, and clicks same-tab links as usual", async () => {
      const open = vi.spyOn(window, "open");
      const t = link("Go to profile", false);
      let clicked = false;
      t.el.addEventListener("click", (e) => {
        clicked = true;
        e.preventDefault(); // jsdom cannot navigate
      });
      const out = await execute(t, "go");
      expect(clicked).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(out.message).toBe("Opened profile.");
    });
  });
});
