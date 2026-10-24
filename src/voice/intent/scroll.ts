// Scrolling for voice control.
// - Commands: "scroll down" (half the visible area), "scroll down a bit" (a quarter), "page down"
//   (almost a screen), "go to the top". They scroll the area the person is working in: the
//   scrollable column holding the current selection (or the open dialog), otherwise the page.
// - reveal(): brings a highlighted control fully into view, clear of whatever covers the edges
//   of its scroll area (sticky bars, the voice button and panel), with room for its label.

export type ScrollCommand = { dir: 1 | -1; amount: "step" | "page" | "bit" | "end" };

const SHARE = { step: 0.5, bit: 0.25, page: 0.85 } as const;

const END = /\b(?:scroll|go|jump|move|take me)(?: back)?(?: all the way)? (?:up |down )?to (?:the )?(top|bottom|end|start|beginning)\b/;
const STEP = /\b(scroll|page|move|go)(?: the page)? (down|up)\b(?:(?: just)? a (?:little )?(bit|little))?/;
const BARE = /^\s*(?:scroll )?(down|up)\s*$/; // "down", "scroll up"

const tidy = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

// The scroll command, when that is all that was said (besides filler).
export function parseScroll(text: string): ScrollCommand | null {
  const s = tidy(text);
  const rest = (m: RegExpMatchArray) => tidy(s.replace(m[0], "").replace(/\b(please|now|again|more|thanks|thank you|a bit|a little)\b/g, ""));
  let m = s.match(END);
  if (m && !rest(m)) return { dir: m[1] === "top" || m[1] === "start" || m[1] === "beginning" ? -1 : 1, amount: "end" };
  m = s.match(STEP);
  if (m && !rest(m)) return { dir: m[2] === "up" ? -1 : 1, amount: m[3] ? "bit" : m[1] === "page" ? "page" : "step" };
  m = s.match(BARE);
  if (m) return { dir: m[1] === "up" ? -1 : 1, amount: "step" };
  return null;
}

function reducedMotion(): boolean {
  return document.documentElement.dataset.reduceMotion === "true" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
  const view = visibleArea(box, null);
  const top = cmd.amount === "end" ? (cmd.dir < 0 ? 0 : Number.MAX_SAFE_INTEGER) : undefined;
  const by = cmd.amount === "end" ? 0 : cmd.dir * (view.bottom - view.top) * SHARE[cmd.amount];
  if (box) {
    if (top !== undefined) box.scrollTo({ top: Math.min(top, box.scrollHeight), behavior });
    else box.scrollBy({ top: by, behavior });
  } else if (top !== undefined) window.scrollTo({ top: Math.min(top, document.documentElement.scrollHeight), behavior });
  else window.scrollBy({ top: by, behavior });
  if (cmd.amount === "end") return cmd.dir < 0 ? "Top." : "Bottom.";
  return cmd.dir < 0 ? "Scrolled up." : "Scrolled down.";
}

// Room kept around a revealed control: above for its highlight label, below for breathing room.
const ROOM_TOP = 44;
const ROOM_BOTTOM = 24;

function covers(el: Element, target: Element | null): HTMLElement | null {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    if (target && (e === target || e.contains(target))) return null;
    const pos = getComputedStyle(e).position;
    if (pos === "fixed" || pos === "sticky") return e as HTMLElement;
  }
  return null;
}

// The part of a scroll area (or the window) that is actually visible: not covered by a sticky or
// fixed bar along its top or bottom edge (checked where the target is, horizontally).
function visibleArea(box: HTMLElement | null, target: HTMLElement | null): { top: number; bottom: number } {
  const r = box?.getBoundingClientRect();
  let top = Math.max(0, r?.top ?? 0);
  let bottom = Math.min(window.innerHeight, r?.bottom ?? window.innerHeight);
  const t = target?.getBoundingClientRect();
  const x = t ? Math.min(Math.max(t.left + Math.min(t.width / 2, 40), 1), window.innerWidth - 1) : window.innerWidth / 2;
  const atTop = document.elementFromPoint(x, top + 2);
  const atBottom = document.elementFromPoint(x, bottom - 2);
  const coverTop = atTop && covers(atTop, target);
  const coverBottom = atBottom && covers(atBottom, target);
  if (coverTop) top = Math.max(top, coverTop.getBoundingClientRect().bottom);
  if (coverBottom) bottom = Math.min(bottom, coverBottom.getBoundingClientRect().top);
  return { top, bottom };
}

// Scroll so `el` is fully visible inside its scroll area, clear of covering bars, with room for
// its label. Returns whether it scrolled.
export function reveal(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const box = scroller(el.parentElement);
  const view = visibleArea(box, el);
  const top = view.top + ROOM_TOP;
  const bottom = view.bottom - ROOM_BOTTOM;
  const r = el.getBoundingClientRect();
  let delta = 0;
  if (r.top < top || r.height > bottom - top) delta = r.top - top; // above, or too tall: align its top
  else if (r.bottom > bottom) delta = r.bottom - bottom;
  if (Math.abs(delta) < 1) return false;
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
  (box ?? window).scrollBy({ top: delta, behavior });
  return true;
}
