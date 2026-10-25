// Scrolling for voice control.
// - Commands: "scroll down" (half the visible area), "scroll down a bit" (a quarter), "page down"
//   (almost a screen), "go to the top". They scroll the area the person is working in: the
//   scrollable column holding the current selection (or the open dialog), otherwise the page.
// - reveal(): brings a highlighted control fully into view, clear of whatever covers the edges
//   of its scroll area (sticky bars, the voice button and panel), with room for its label.

export type ScrollCommand = { dir: 1 | -1; amount: "step" | "page" | "bit" | "end" };

const SHARE = { step: 0.5, bit: 0.25, page: 0.85 } as const;

const END = /\b(?:scroll|go|jump|move|take me)(?: back)?(?: all the way)? (?:up |down )?to (?:the )?(top|bottom|end|start|beginning)\b/g;
const STEP = /\b(scroll|page|move|go)(?: the page)? (down|up)\b(?:(?: just)? a (?:little )?(bit|little))?/g;
const BARE = /\b(down|up)\b/g; // "down", "uh, up"
// Hesitations, politeness and lead-ins around a command ("uh", often heard as "I"; "can you",
// "I want to", "let me").
const FILLER =
  /\b(uh+|um+|uhm+|erm?|hmm+|ah+|oh|well|so|and|then|okay|ok|please|now|again|more|thanks|thank you|just|a bit|a little|scroll|i|i'd|id|i'll|want|wanna|need|would|like|to|can|could|will|you|let|let's|lets|me|us|try|the|it)\b/g;

const tidy = (s: string) => s.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();

// The scroll command when that is all that was said, besides hesitations and filler ("uh, scroll
// down"). A command said several times in a row ("scroll down, scroll down") counts once, as the
// last one said: repeating is impatience, not a request for three steps.
export function parseScroll(text: string): ScrollCommand | null {
  let s = tidy(text);
  const hits: { at: number; cmd: ScrollCommand }[] = [];
  const take = (re: RegExp, cmd: (m: RegExpExecArray) => ScrollCommand) => {
    s = s.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      hits.push({ at: args.at(-2) as number, cmd: cmd(m) });
      return " ".repeat(args[0].length);
    });
  };
  take(END, (m) => ({ dir: m[1] === "top" || m[1] === "start" || m[1] === "beginning" ? -1 : 1, amount: "end" }));
  take(STEP, (m) => ({ dir: m[2] === "up" ? -1 : 1, amount: m[3] ? "bit" : m[1] === "page" ? "page" : "step" }));
  if (!hits.length && tidy(s.replace(FILLER, "").replace(BARE, ""))) return null;
  if (!hits.length) take(BARE, (m) => ({ dir: m[1] === "up" ? -1 : 1, amount: "step" }));
  if (!hits.length || tidy(s.replace(FILLER, ""))) return null;
  return hits.sort((a, b) => a.at - b.at).at(-1)!.cmd;
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

// A layout of scrolling columns (Jobs: filters, list, details; Profile: the form) does not scroll
// the window. Then the column holding the page's main region scrolls, else the largest one on screen.
function mainScroller(): HTMLElement | null {
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollHeight > root.clientHeight + 1 && getComputedStyle(document.body).overflowY !== "hidden") return null;
  const primary = scroller(document.querySelector("[data-voice-primary]"));
  if (primary) return primary;
  let best: HTMLElement | null = null;
  let most = 0;
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    if (el.scrollHeight <= el.clientHeight + 1 || !/^(auto|scroll)$/.test(getComputedStyle(el).overflowY)) continue;
    const r = el.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    if (area > most) [best, most] = [el, area];
  }
  return best;
}

export function scrollPage(cmd: ScrollCommand, near: Element | null): string {
  const dialog = document.querySelector("dialog[open]");
  const box = scroller(near) ?? (dialog ? (scroller(dialog.firstElementChild) ?? (dialog as HTMLElement)) : mainScroller());
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
