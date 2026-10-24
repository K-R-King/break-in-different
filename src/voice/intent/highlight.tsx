// Green highlights for voice control. "guess": what the person seems to mean, drawn while they
// are still talking. "doing": the action is running. "done": the current selection (what "it"
// means next). It stays until something else is selected, so a low-vision user never loses track,
// but only one green is ever drawn: a guess or action hides it while shown (see shown());
// it fades only when its element is gone (after a page change, once LINGER_MS has passed) or a
// while after listening stops.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import "../live/voice.css";

export type HighlightState = "guess" | "unsure" | "doing" | "done";

export interface Highlight {
  key: number;
  el: HTMLElement;
  label: string;
  state: HighlightState;
  fading?: boolean;
}

const LINGER_MS = 1500; // a selection whose element vanished (page changed) stays this long
const FADE_MS = 1200;
const SETTLE_MS = 350; // a guess this stable is worth scrolling to

let items: Highlight[] = [];
let nextKey = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function setItems(next: Highlight[]) {
  items = next;
  emit();
}

export const highlights = {
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  get: () => items,
  // The current guess (one at a time). Same element: only the label/state change.
  guess(el: HTMLElement, label: string, state: "guess" | "unsure" = "guess") {
    const rest = items.filter((h) => h.state === "done");
    const cur = items.find((h) => h.state === "guess" || h.state === "unsure");
    if (cur && cur.el === el && cur.label === label && cur.state === state) return;
    setItems([...rest, { key: cur?.el === el ? cur.key : nextKey++, el, label, state }]);
  },
  clearGuess() {
    if (items.some((h) => h.state === "guess" || h.state === "unsure")) setItems(items.filter((h) => h.state === "done" || h.state === "doing"));
  },
  doing(el: HTMLElement, label: string) {
    const cur = items.find((h) => h.state !== "done" && h.el === el);
    setItems([...items.filter((h) => h.state === "done"), { key: cur?.key ?? nextKey++, el, label, state: "doing" }]);
  },
  // The action finished: its highlight becomes the selection, replacing the previous one.
  // `el` may have moved (opener -> real control).
  done(el: HTMLElement, label: string) {
    const cur = items.find((h) => h.state === "doing");
    const key = cur?.key ?? nextKey++;
    setItems([...items.filter((h) => h !== cur && h.state !== "done" && h.el !== el), { key, el, label, state: "done" }]);
  },
  // Fade out and remove one highlight, or every selection after `delay` ms.
  fade(key: number) {
    if (!items.some((h) => h.key === key && !h.fading)) return;
    setItems(items.map((h) => (h.key === key ? { ...h, fading: true } : h)));
    window.setTimeout(() => setItems(items.filter((h) => h.key !== key)), FADE_MS);
  },
  expireSelection(delay: number) {
    const keys = items.filter((h) => h.state === "done").map((h) => h.key);
    return window.setTimeout(() => keys.forEach((k) => highlights.fade(k)), delay);
  },
  clearAll: () => setItems([]),
};

export function useHighlights() {
  return useSyncExternalStore(highlights.subscribe, highlights.get, highlights.get);
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function boxOf(el: HTMLElement): Box | null {
  if (!el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function reducedMotion() {
  return document.documentElement.dataset.reduceMotion === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function Ring({ h }: { h: Highlight }) {
  const last = useRef<Box | null>(null);
  const [box, setBox] = useState<Box | null>(() => boxOf(h.el));
  const scrolled = useRef<HTMLElement | null>(null);

  // Follow the element every frame (scrolling, layout shifts); keep the last box if it vanishes,
  // then fade once it has been gone for LINGER_MS.
  useEffect(() => {
    let raf = 0;
    let goneSince = 0;
    const tick = () => {
      const b = boxOf(h.el);
      if (b) last.current = b;
      if (h.el.isConnected) goneSince = 0;
      else if (!goneSince) goneSince = performance.now();
      else if (performance.now() - goneSince > LINGER_MS) highlights.fade(h.key);
      setBox((prev) => {
        const next = b ?? last.current;
        if (prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) return prev;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [h.el, h.key]);

  // Bring an off-screen target into view once the prediction has settled (a guess that held for
  // SETTLE_MS), or at once when acting, so the page does not jump around while words arrive.
  useEffect(() => {
    if (h.state === "done" || scrolled.current === h.el) return;
    const go = () => {
      if (!h.el.isConnected) return;
      scrolled.current = h.el;
      const r = h.el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) h.el.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    };
    if (h.state === "doing") return go();
    const t = window.setTimeout(go, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [h.el, h.state]);

  if (!box) return null;
  const pad = 4;
  return (
    <div
      className="voice-hl"
      data-state={h.state}
      data-fading={h.fading || undefined}
      data-testid="voice-highlight"
      style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    >
      <span className="voice-hl-tag">{h.label}</span>
    </div>
  );
}

// Rendered where the target lives: an open modal dialog sits in the top layer, above the page.
// One green at a time: the active guess or action when there is one, otherwise the selection.
// The selection is only hidden, not dropped, so it returns if the guess goes away unused.
export function shown(list: Highlight[]): Highlight[] {
  const active = list.filter((h) => h.state !== "done");
  return (active.length ? active : list).slice(-1);
}

export function HighlightLayer() {
  const list = shown(useHighlights());
  const byHost = new Map<Element, Highlight[]>();
  for (const h of list) {
    const host = (h.el.isConnected && h.el.closest("dialog[open]")) || document.body;
    byHost.set(host, [...(byHost.get(host) ?? []), h]);
  }
  return (
    <>
      {[...byHost].map(([host, hs]) =>
        createPortal(
          <div className="voice-hl-layer" aria-hidden="true">
            {hs.map((h) => (
              <Ring key={h.key} h={h} />
            ))}
          </div>,
          host,
          host === document.body ? "body" : String(hs[0].key),
        ),
      )}
    </>
  );
}
