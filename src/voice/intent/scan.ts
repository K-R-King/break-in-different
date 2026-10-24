// Reads the page into voice targets: every control by its visible name, every group (fieldset,
// labelled region, panel with a heading) by its legend or heading. Alternate names come from
// data-voice-names="a|b|c". A closed dialog's controls count only when the dialog names its
// opener (data-voice-opener="<data-voice-id of the button>"), e.g. Accessibility settings.
import type { Candidate, Kind } from "./match";

export interface Target extends Candidate {
  el: HTMLElement;
  opener?: HTMLElement; // click this first to reveal el
  danger?: boolean; // irreversible: voice may point at it but never press it
  label: string; // the name shown and spoken
}

const CONTROLS =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';
const GROUPS =
  'fieldset, [role="group"], [role="region"], [role="radiogroup"], aside, section, nav[aria-label], form, dialog, .panel, .card, [data-voice-names]:not(' + CONTROLS + ")";
const SKIP = '[data-voice-ignore], .voice-wrap, .voice-hl-layer, [aria-hidden="true"], [inert]';
const NOISE = new Set(["KBD", "SVG", "STYLE", "SCRIPT"]);

function textOf(el: Element): string {
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
    else if (n instanceof Element && !NOISE.has(n.tagName.toUpperCase()) && !n.matches('.muted, .hint, [aria-hidden="true"], input, select, textarea'))
      out += ` ${textOf(n)} `;
  }
  return out.replace(/\s+/g, " ").trim();
}

function byIds(ids: string | null): string {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((e): e is HTMLElement => !!e)
    .map(textOf)
    .join(" ");
}

function controlName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label") || byIds(el.getAttribute("aria-labelledby"));
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const l = el.labels?.[0];
    if (l) return textOf(l);
    return el.getAttribute("placeholder") || el.title || "";
  }
  return textOf(el) || el.title || "";
}

function groupName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label") || byIds(el.getAttribute("aria-labelledby"));
  if (aria) return aria;
  if (el instanceof HTMLFieldSetElement) {
    const lg = el.querySelector(":scope > legend");
    if (lg) return textOf(lg);
  }
  const h = el.querySelector(":scope > h2, :scope > h3, :scope > header h2, :scope > div > h2, :scope > div > h3");
  return h ? textOf(h) : "";
}

function kindOf(el: HTMLElement): Kind {
  const role = el.getAttribute("role");
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return "checkbox";
    if (el.type === "radio") return "radio";
    if (el.type === "range") return "range";
    if (el.type === "submit" || el.type === "button" || el.type === "reset") return "button";
    return "text";
  }
  if (el instanceof HTMLTextAreaElement) return "text";
  if (el instanceof HTMLSelectElement) return "select";
  if (role === "checkbox" || role === "switch") return "checkbox";
  if (role === "radio") return "radio";
  if (el instanceof HTMLAnchorElement || role === "link") return "link";
  return "button";
}

function altNames(el: HTMLElement): string[] {
  return (el.dataset.voiceNames ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function scanPage(root: ParentNode = document): Target[] {
  const out: Target[] = [];
  const groupId = new Map<Element, number>();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // An open modal dialog makes everything outside it unreachable.
  let modal: Element | null = null;
  try {
    modal = document.querySelector("dialog[open]:modal");
  } catch {
    modal = document.querySelector("dialog[open]");
  }

  // Where an element can be reached from: on screen, behind a declared opener, or not at all.
  const reach = (el: HTMLElement): { ok: boolean; opener?: HTMLElement } => {
    if (el.closest(SKIP)) return { ok: false };
    const dlg = el.closest("dialog");
    if (dlg && !dlg.open) {
      const id = dlg.getAttribute("data-voice-opener");
      const opener = id ? document.querySelector<HTMLElement>(`[data-voice-id="${id}"]`) : null;
      return opener && opener.getClientRects().length ? { ok: true, opener } : { ok: false };
    }
    if (modal && !modal.contains(el)) return { ok: false };
    return { ok: el.getClientRects().length > 0 };
  };

  const parentOf = (el: Element): number | undefined => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const id = groupId.get(p);
      if (id !== undefined) return id;
    }
    return undefined;
  };

  const inView = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };

  for (const el of root.querySelectorAll<HTMLElement>(GROUPS)) {
    const name = groupName(el);
    const alts = altNames(el);
    if (!name && !alts.length) continue;
    const r = reach(el);
    if (!r.ok) continue;
    const id = out.length;
    groupId.set(el, id);
    out.push({ id, kind: "group", el, label: name || alts[0], names: [name, ...alts].filter(Boolean), parent: parentOf(el), hidden: !!r.opener, opener: r.opener, inView: !r.opener && inView(el) });
  }

  for (const el of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    // A control's label wraps it: reach the input through its own box, not the label's.
    const name = controlName(el);
    const alts = altNames(el);
    if (!name && !alts.length) continue;
    const r = reach(el);
    // Visually hidden native radios and checkboxes sit inside a visible label.
    const visibleVia = !r.ok && (el as HTMLInputElement).labels?.[0];
    if (!r.ok && !(visibleVia && reach(visibleVia).ok)) continue;
    const kind = kindOf(el);
    const checked =
      el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true";
    out.push({
      id: out.length,
      kind,
      el,
      label: name || alts[0],
      names: [name, ...alts].filter(Boolean),
      parent: parentOf(el),
      hidden: !!r.opener,
      opener: r.opener,
      current: el.getAttribute("aria-current") === "page",
      checked,
      inView: !r.opener && inView(el),
      danger: !!el.closest("[data-voice-danger]"),
    });
  }
  return out;
}

// The scan is kept until the page changes (DOM, scroll, size), so matching each new word costs
// only the matching. Changes inside voice control's own UI do not count.
let cache: Target[] | null = null;
let watching = false;
const OWN = ".voice-wrap, .voice-hl-layer, .voice-panel";
function watch() {
  if (watching) return;
  watching = true;
  const drop = () => (cache = null);
  new MutationObserver((recs) => {
    if (recs.some((r) => !(r.target instanceof Element ? r.target : r.target.parentElement)?.closest(OWN))) drop();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  window.addEventListener("scroll", drop, { capture: true, passive: true });
  window.addEventListener("resize", drop, { passive: true });
}

export function scanCached(): Target[] {
  watch();
  return (cache ??= scanPage());
}

// The box to highlight: a checkbox or radio is drawn with its label, a hidden target at its opener.
export function highlightBox(t: Target): HTMLElement {
  if (t.opener) return t.opener;
  if ((t.kind === "checkbox" || t.kind === "radio") && t.el instanceof HTMLInputElement) return t.el.closest("label") ?? t.el;
  return t.el;
}
