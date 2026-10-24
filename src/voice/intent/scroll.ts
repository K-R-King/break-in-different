// Page-level scrolling by voice: "scroll down", "page up", "scroll down a bit", "go to the top".
// Scrolls the area the person is working in: the scrollable column holding the current selection
// (or the open dialog), otherwise the page.

export type ScrollCommand = { dir: 1 | -1; amount: "page" | "bit" | "end" };

const END = /\b(?:scroll|go|jump|move|take me)(?: back)?(?: all the way)? (?:up |down )?to (?:the )?(top|bottom|end|start|beginning)\b/;
const STEP = /\b(?:scroll|page|move|go)(?: the page)? (down|up)\b(?:(?: just)? a (?:little )?(bit|little))?/;
const BARE = /^\s*(?:scroll )?(down|up)\s*$/; // "down", "scroll up"

const tidy = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

// The scroll command, when that is all that was said (besides filler).
export function parseScroll(text: string): ScrollCommand | null {
  const s = tidy(text);
  const rest = (m: RegExpMatchArray) => tidy(s.replace(m[0], "").replace(/\b(please|now|again|more|thanks|thank you|a bit|a little)\b/g, ""));
  let m = s.match(END);
  if (m && !rest(m)) return { dir: m[1] === "top" || m[1] === "start" || m[1] === "beginning" ? -1 : 1, amount: "end" };
  m = s.match(STEP);
  if (m && !rest(m)) return { dir: m[1] === "up" ? -1 : 1, amount: m[2] ? "bit" : "page" };
  m = s.match(BARE);
  if (m) return { dir: m[1] === "up" ? -1 : 1, amount: "page" };
  return null;
}

function scroller(from: Element | null): HTMLElement | null {
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

export function scrollPage(cmd: ScrollCommand, near: Element | null): string {
  const dialog = document.querySelector("dialog[open]");
  const box = scroller(near) ?? (dialog ? (scroller(dialog.firstElementChild) ?? (dialog as HTMLElement)) : null);
  const reduce = document.documentElement.dataset.reduceMotion === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  const height = box ? box.clientHeight : window.innerHeight;
  const top = cmd.amount === "end" ? (cmd.dir < 0 ? 0 : Number.MAX_SAFE_INTEGER) : undefined;
  const by = cmd.dir * height * (cmd.amount === "bit" ? 0.3 : 0.8);
  if (box) {
    if (top !== undefined) box.scrollTo({ top: Math.min(top, box.scrollHeight), behavior });
    else box.scrollBy({ top: by, behavior });
  } else if (top !== undefined) window.scrollTo({ top: Math.min(top, document.documentElement.scrollHeight), behavior });
  else window.scrollBy({ top: by, behavior });
  if (cmd.amount === "end") return cmd.dir < 0 ? "Top." : "Bottom.";
  return cmd.dir < 0 ? "Scrolled up." : "Scrolled down.";
}
