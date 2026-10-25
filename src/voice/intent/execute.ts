// Carries out a matched voice target. Each verb is a distinct action:
//   on      make it active: check a box, choose an option, press a button that is not pressed.
//           Never turns anything off.
//   off     make it inactive. Never turns anything on.
//   toggle  flip it.
//   select  choose an option or check a box; other controls are only selected.
//   press   click it.
//   go      follow a link or open; anything else is selected and brought into view.
//   do      the default action of what is selected ("yes", "do it").
//   none    select only: focus and highlight, change nothing. The person hears what it is and
//           its state, and can then say "turn it on", "press it", "yes"...
import type { Verb } from "./match";
import type { Target } from "./scan";
import { reveal } from "./scroll";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface Outcome {
  changed: boolean;
  message: string;
  el: HTMLElement; // where the action landed (for the lingering highlight)
}

const isOn = (el: HTMLElement) =>
  el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true";
const isToggleButton = (el: HTMLElement) => el.hasAttribute("aria-pressed");

function describe(t: Target): string {
  const el = t.el;
  switch (t.kind) {
    case "checkbox":
      return `${t.label}: ${isOn(el) ? "on" : "off"}. Say "turn on", "turn off" or "toggle".`;
    case "radio":
      return `${t.label}: ${isOn(el) ? "selected" : "not selected"}.${isOn(el) ? "" : ` Say "select" to choose it.`}`;
    case "link":
      return `${t.label}, link. Say "open" to go there.`;
    case "button":
      return isToggleButton(el) ? `${t.label}: ${isOn(el) ? "on" : "off"}. Say "turn on" or "turn off".` : `${t.label}, button. Say "press" to use it.`;
    case "group":
      return `${t.label}.`;
    default:
      return `${t.label}. Ready for input.`;
  }
}

function select(t: Target): Outcome {
  if (t.kind === "group") {
    reveal(t.el);
    const first = t.el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select, textarea, button:not([disabled]), a[href]');
    first?.focus({ preventScroll: true });
  } else t.el.focus({ preventScroll: true });
  return { changed: false, message: describe(t), el: t.el };
}

function setState(t: Target, want: boolean): Outcome {
  const el = t.el;
  const now = isOn(el);
  if (now !== want) el.click();
  el.focus({ preventScroll: true });
  const word = t.kind === "radio" ? (want ? "selected" : "not selected") : want ? "on" : "off";
  return { changed: now !== want, message: now === want ? `${t.label} is already ${word}.` : `${t.label}: ${word}.`, el };
}

// "Open application page" is said as "Opened application page", not "Opened Open application page".
const linkName = (label: string) => label.replace(/^(open|go to|visit|view|see|show)\s+/i, "") || label;

// A link that opens a new tab: browsers block a scripted click without the person's own click or
// key press, which a voice command never has. Open the tab directly; if that is blocked too, follow
// the link in this tab, so it still goes where the person asked.
function openNewTab(a: HTMLAnchorElement): boolean {
  // The link's own click handler still runs (it may note that the person left for the employer's site).
  a.addEventListener("click", (e) => e.preventDefault(), { once: true });
  a.click();
  const tab = window.open(a.href, "_blank");
  if (tab) {
    tab.opener = null;
    return true;
  }
  window.location.assign(a.href);
  return false;
}

function press(t: Target): Outcome {
  if (t.kind !== "link") {
    t.el.click();
    return { changed: true, message: `Pressed ${t.label}.`, el: t.el };
  }
  const a = t.el;
  const newTab = a instanceof HTMLAnchorElement && a.target === "_blank" && !!a.href ? openNewTab(a) : (a.click(), false);
  return { changed: true, message: `Opened ${linkName(t.label)}${newTab ? " in a new tab" : ""}.`, el: a };
}

export async function execute(t: Target, verb: Verb | null): Promise<Outcome> {
  const name = t.label;
  // A dropdown option without a verb: only select the dropdown.
  if (t.run && !t.command && (verb === null || verb === "go")) {
    t.el.focus({ preventScroll: true });
    return { changed: false, message: `${name}. Say "select" to choose it.`, el: t.el };
  }
  // A voice-only command, or a chosen dropdown option.
  if (t.run) {
    if (verb === "off") return { changed: false, message: `${name} can't be turned off.`, el: t.el };
    await t.run();
    const m = typeof t.message === "function" ? t.message() : t.message;
    return { changed: true, message: m ?? `${name}.`, el: t.el };
  }
  const changes = verb !== null && verb !== "go";
  if (t.danger && changes) return { changed: false, message: `For your safety, "${name}" can't be done by voice. Use the keyboard or mouse.`, el: t.el };

  if (t.opener) {
    t.opener.click();
    // The dialog opens on the next render; wait until the target is on screen.
    for (let i = 0; i < 10 && !t.el.getClientRects().length && !t.el.closest("label")?.getClientRects().length; i++) await frame();
  }

  switch (t.kind) {
    case "checkbox":
      if (verb === "on" || verb === "select") return setState(t, true);
      if (verb === "off") return setState(t, false);
      if (verb === "toggle" || verb === "press" || verb === "do") return setState(t, !isOn(t.el));
      return select(t);
    case "radio":
      if (verb === "on" || verb === "select" || verb === "toggle" || verb === "press" || verb === "do") return setState(t, true);
      if (verb === "off") return { changed: false, message: `${name} can't be turned off. Choose another option instead.`, el: t.el };
      return select(t);
    case "button":
      if (isToggleButton(t.el)) {
        if (verb === "on") return setState(t, true);
        if (verb === "off") return setState(t, false);
        // Saying a toggle command's name turns it the way it says (Save on, Unsave off), never back.
        if (verb === null && t.command) return setState(t, t.commandWay !== "off");
      } else if (verb === "off") return { changed: false, message: `${name} is a button, not a switch.`, el: t.el };
      if (verb === "on" || verb === "toggle" || verb === "press" || verb === "do" || verb === "go" || (verb === null && t.command)) return press(t);
      return select(t);
    case "link":
      if (verb === "go" || verb === "press" || verb === "do" || verb === "on" || verb === "select" || (verb === null && t.command)) return press(t);
      return select(t);
    default:
      return select(t);
  }
}

// Puts text into a text field as if typed (React sees the change), and focuses it.
export function fillText(el: HTMLElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus({ preventScroll: true });
}

// What the highlight tag says before acting.
export function intentLabel(t: Target, verb: Verb | null): string {
  const where = t.opener ? `Settings › ${t.label}` : t.label;
  if (t.danger && verb && verb !== "go") return `${where} (keyboard only)`;
  if (t.run || (t.command && verb === null)) return where;
  if (verb === null) return where;
  switch (t.kind) {
    case "checkbox":
      return `${verb === "off" ? "Turn off" : verb === "on" || verb === "select" ? "Turn on" : verb === "go" ? "Show" : "Toggle"}: ${where}`;
    case "radio":
      return verb === "off" ? where : verb === "go" ? `Show: ${where}` : `Select: ${where}`;
    case "link":
      return `Go to: ${linkName(where)}`;
    case "button":
      return verb === "off" && isToggleButton(t.el) ? `Turn off: ${where}` : `Press: ${where}`;
    default:
      return where;
  }
}
