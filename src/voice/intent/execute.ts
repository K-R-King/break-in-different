// Carries out a matched voice target. Returns the short confirmation to show and announce.
import type { Verb } from "./match";
import type { Target } from "./scan";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface Outcome {
  done: boolean;
  message: string;
  el: HTMLElement; // where the action landed (for the lingering highlight)
}

export async function execute(t: Target, verb: Verb | null): Promise<Outcome> {
  const name = t.label;
  if (t.danger) return { done: false, message: `For your safety, "${name}" can't be done by voice. Use the keyboard or mouse.`, el: t.el };

  if (t.opener) {
    t.opener.click();
    // The dialog opens on the next render; wait until the target is on screen.
    for (let i = 0; i < 10 && !t.el.getClientRects().length && !t.el.closest("label")?.getClientRects().length; i++) await frame();
  }
  const el = t.el;

  switch (t.kind) {
    case "checkbox": {
      const input = el as HTMLInputElement;
      const isOn = input.checked ?? el.getAttribute("aria-checked") === "true";
      const want = verb === "off" ? false : verb === "on" ? true : !isOn;
      if (isOn !== want) el.click();
      return { done: true, message: `${name}: ${want ? "on" : "off"}.`, el };
    }
    case "radio":
      if (!(el as HTMLInputElement).checked) el.click();
      return { done: true, message: `${name} selected.`, el };
    case "text":
    case "select":
    case "range":
      el.focus();
      return { done: true, message: `${name}. Ready for input.`, el };
    case "group": {
      el.scrollIntoView({ block: "nearest" });
      const first = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select, textarea, button:not([disabled]), a[href]');
      first?.focus({ preventScroll: true });
      return { done: true, message: `${name}.`, el };
    }
    case "link":
      el.click();
      return { done: true, message: `Opened ${name}.`, el };
    default:
      el.click();
      return { done: true, message: `${name}.`, el };
  }
}

// What the highlight tag says before acting.
export function intentLabel(t: Target, verb: Verb | null): string {
  const where = t.opener ? `Settings › ${t.label}` : t.label;
  if (t.danger) return `${where} (keyboard only)`;
  switch (t.kind) {
    case "checkbox":
      return `${verb === "off" ? "Turn off" : verb === "on" ? "Turn on" : t.checked ? "Turn off" : "Turn on"}: ${where}`;
    case "radio":
      return `Select: ${where}`;
    case "link":
      return `Go to: ${where}`;
    case "group":
      return where;
    case "text":
    case "select":
    case "range":
      return `Fill in: ${where}`;
    default:
      return `Press: ${where}`;
  }
}
