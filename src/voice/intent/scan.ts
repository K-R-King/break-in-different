// Reads the page into voice targets: every control by its visible name, every group (fieldset,
// labelled region, panel with a heading) by its legend or heading. Alternate names come from
// data-voice-names="a|b|c". A closed dialog's controls count only when the dialog names its
// opener (data-voice-opener="<data-voice-id of the button>"), e.g. Accessibility settings.
// Other annotations:
//   data-voice-label="…"   the name voice uses instead of the visible text (when that misleads)
//   data-voice-command     saying its name performs it (Read aloud, Pause, Stop), no verb needed;
//                          on a toggle, ="on" or ="off" says which way (Save / Unsave)
//   data-voice-private     never described to the assistant (disability details); still usable
//   data-voice-primary     the main region of the page (the open job), preferred when unsure
//   data-voice-danger      irreversible: voice may point at it but never press it
// Voice-only commands registered by pages (actions.ts) are added as targets too.
import { actionsVersion, currentActions } from "./actions";
import { tokens, type Candidate, type Kind } from "./match";

export interface Target extends Candidate {
  el: HTMLElement;
  opener?: HTMLElement; // click this first to reveal el
  danger?: boolean; // irreversible: voice may point at it but never press it
  toggle?: boolean; // a button that stays pressed (aria-pressed)
  command?: boolean; // its name is the command: say it and it happens
  commandWay?: "on" | "off"; // for a toggle command: which way saying its name turns it
  private?: boolean; // never described to the assistant
  primary?: boolean; // the page's main region
  run?: () => unknown; // a voice-only command (actions.ts)
  message?: string | (() => string);
  label: string; // the name shown and spoken
}

// A file input out of the tab order is worked by a visible button ("Choose a PDF"), not directly.
const CONTROLS =
  'a[href], button, summary, input:not([type="hidden"]):not([type="file"][tabindex="-1"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';
const GROUPS =
  'fieldset, [role="group"], [role="region"], [role="radiogroup"], aside, section, article, nav[aria-label], form, dialog, .panel, .card, [data-voice-names]:not(' + CONTROLS + ")";
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

// The screen reader note on links that open a new tab: not part of the name people say or hear.
const NEW_TAB = /\s*\(opens in a new (tab|window)\)/gi;

function controlName(el: HTMLElement): string {
  if (el.dataset.voiceLabel) return el.dataset.voiceLabel;
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
  if (el.dataset.voiceLabel) return el.dataset.voiceLabel;
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
    if (el.type === "submit" || el.type === "button" || el.type === "reset" || el.type === "file") return "button";
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
    // Inside a collapsed <details>: reached by opening its summary first.
    const det = el.closest("details");
    if (det && !det.open && !el.closest("summary")) {
      const summary = det.querySelector<HTMLElement>(":scope > summary");
      return summary && reach(summary).ok ? { ok: true, opener: summary } : { ok: false };
    }
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
    out.push({
      id,
      kind: "group",
      el,
      label: name || alts[0],
      names: [name, ...alts].filter(Boolean),
      parent: parentOf(el),
      hidden: !!r.opener,
      opener: r.opener,
      inView: !r.opener && inView(el),
      // The item already open (the selected job's card): its details are shown elsewhere.
      current: el.getAttribute("aria-current") === "true" || el.getAttribute("aria-current") === "page",
      private: !!el.closest("[data-voice-private]"),
      primary: el.hasAttribute("data-voice-primary"),
    });
  }

  for (const el of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    // A control's label wraps it: reach the input through its own box, not the label's.
    const name = controlName(el).replace(NEW_TAB, "");
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
      // The page open now, or the item already open (the selected job's card title link).
      current:
        el.getAttribute("aria-current") === "page" ||
        (kind === "link" && el.getAttribute("href")?.startsWith("#") === true && !!el.closest('[aria-current="true"], [aria-current="page"]')),
      checked,
      inView: !r.opener && inView(el),
      danger: !!el.closest("[data-voice-danger]"),
      toggle: kind === "button" && el.hasAttribute("aria-pressed"),
      command: el.hasAttribute("data-voice-command"),
      commandWay: (["on", "off"] as const).find((w) => w === el.getAttribute("data-voice-command")),
      private: !!el.closest("[data-voice-private]"),
    });
  }
  return withActions(withOptions(canonicalize(out)));
}

// Each option of a dropdown ("Status: Applied", "Sort by: Deadline") is a target of its own, so it
// can be chosen by name. Like a radio button: chosen with a verb, only selected without one.
function withOptions(list: Target[]): Target[] {
  const out = [...list];
  for (const t of list) {
    if (t.kind !== "select" || !(t.el instanceof HTMLSelectElement)) continue;
    const select = t.el;
    const field = t.label.replace(/ for .*$/, "");
    for (const option of select.options) {
      if (option.disabled || !option.text.trim()) continue;
      const text = option.text.trim();
      out.push({
        id: out.length,
        kind: "radio",
        el: select,
        label: `${field}: ${text}`,
        names: [text, `${field} ${text}`, `${t.label} ${text}`],
        parent: t.parent,
        hidden: t.hidden,
        opener: t.opener,
        checked: option.selected,
        private: t.private,
        inView: t.inView,
        run: () => {
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, option.value);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        },
        message: `${field}: ${text}.`,
      });
    }
  }
  return out;
}

// Voice-only commands, highlighted at their anchor and narrowed by the regions around it.
function withActions(list: Target[]): Target[] {
  const out = [...list];
  for (const a of currentActions()) {
    const anchor = a.anchor?.() ?? document.querySelector<HTMLElement>("main") ?? document.body;
    let parent: number | undefined;
    for (const g of list) if (g.kind === "group" && g.el.contains(anchor) && (parent === undefined || list[parent].el.contains(g.el))) parent = g.id;
    out.push({ id: out.length, kind: "button", el: anchor, label: a.names[0], names: a.names, parent, command: true, run: a.run, message: a.message, inView: true });
  }
  return out;
}

const unique = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];

// One target per thing the person can mean, so overlapping boxes never compete:
// - links to the same address are one target (the first, e.g. the header link);
// - a group around a single control is that control ("Your name" is the Full name box);
// - nested groups around the same controls are the tightest one.
// Every merged name is kept as an alternate name (for matching and for the assistant).
export function canonicalize(list: Target[]): Target[] {
  const gone = new Set<number>();
  const byId = new Map(list.map((t) => [t.id, t]));
  const absorb = (into: Target, from: Target) => {
    into.names = unique([...into.names, ...from.names]);
    gone.add(from.id);
  };

  const replaced = new Map<number, number>(); // removed group -> target that stands in for it
  const keyOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Links to the same page (not same-page anchors like "#detail", which differ by what they do).
  const byHref = new Map<string, Target>();
  for (const t of list) {
    if (t.kind !== "link" || t.hidden || !(t.el instanceof HTMLAnchorElement) || t.el.getAttribute("href")?.startsWith("#")) continue;
    const first = byHref.get(t.el.href);
    if (first) absorb(first, t);
    else byHref.set(t.el.href, t);
  }

  // A closed dialog is its opener: "Accessibility settings" is one target, and the opener is the
  // context for the dialog's controls ("settings high contrast").
  for (const t of list) {
    if (t.kind !== "group" || !t.opener || !(t.el instanceof HTMLDialogElement)) continue;
    const opener = list.find((o) => o.el === t.opener && !gone.has(o.id));
    if (!opener) continue;
    absorb(opener, t);
    replaced.set(t.id, opener.id);
  }

  // The same control shown on the page and inside a closed dialog (same words, any order or
  // synonym: "Text-to-speech with word highlighting" / "Read aloud with word highlighting"):
  // the visible one is enough.
  const meaning = (t: Target) => `${t.kind}:${[...new Set(tokens(t.label))].sort().join(" ")}`;
  const visible = new Set(list.filter((t) => !t.hidden && t.kind !== "group").map(meaning));
  for (const t of list) if (t.hidden && t.kind !== "group" && visible.has(meaning(t))) gone.add(t.id);

  // A table-of-contents link ("2. Features to apply" in the Profile's section list) is the
  // section it jumps to.
  for (const t of list) {
    const href = t.kind === "link" ? t.el.getAttribute("href") : null;
    if (!href?.startsWith("#") || href.length < 2 || !t.el.closest("nav") || gone.has(t.id)) continue;
    const dest = document.getElementById(href.slice(1));
    const section = dest && list.find((g) => g.kind === "group" && g.el === dest && !gone.has(g.id));
    if (section) absorb(section, t);
  }

  // The controls each group contains (any depth).
  const controls = new Map<number, number[]>();
  for (const t of list) {
    if (t.kind === "group" || gone.has(t.id)) continue;
    for (let p = t.parent; p !== undefined; p = byId.get(p)?.parent) controls.set(p, [...(controls.get(p) ?? []), t.id]);
  }
  const key = (id: number) => (controls.get(id) ?? []).join(",");

  // Innermost groups first, so a chain of wrappers collapses into the tightest box.
  const depth = (t: Target) => {
    let d = 0;
    for (let p = t.parent; p !== undefined; p = byId.get(p)?.parent) d++;
    return d;
  };
  const groups = list.filter((t) => t.kind === "group" && !gone.has(t.id)).sort((a, b) => depth(b) - depth(a));

  // Nested groups with the same name (a sidebar labelled by its first panel's heading): the name
  // belongs to the inner, tighter box; an outer box left without a name is dropped.
  const isInside = (inner: Target, outer: Target) => {
    for (let p = inner.parent; p !== undefined; p = byId.get(p)?.parent) if (p === outer.id) return true;
    return false;
  };
  for (const outer of groups) {
    const innerNames = new Set(groups.filter((g) => g !== outer && isInside(g, outer)).flatMap((g) => g.names.map(keyOf)));
    const left = outer.names.filter((n) => !innerNames.has(keyOf(n)));
    if (left.length === outer.names.length) continue;
    if (left.length) {
      outer.names = left;
      outer.label = left[0];
    } else gone.add(outer.id);
  }

  const tightest = new Map<string, Target>(); // control set -> innermost group with it
  for (const g of groups) {
    if (gone.has(g.id)) continue;
    const inside = controls.get(g.id) ?? [];
    if (inside.length === 1) {
      absorb(byId.get(inside[0])!, g);
      continue;
    }
    if (!inside.length) continue; // text-only region: kept for reading and orientation
    const k = key(g.id);
    const inner = tightest.get(k);
    if (inner) {
      // Keep the tight inner box, named by the outer heading people see ("4. Your disability or
      // neurodivergence", not the inner legend "Select any that apply").
      inner.names = unique([...g.names, ...inner.names]);
      inner.label = g.label;
      gone.add(g.id);
    }
    else tightest.set(k, g);
  }

  // Renumber and point each survivor at its closest surviving group.
  const kept = list.filter((t) => !gone.has(t.id));
  const newId = new Map(kept.map((t, i) => [t.id, i]));
  return kept.map((t) => {
    let p = t.parent;
    while (p !== undefined && gone.has(p)) p = replaced.get(p) ?? byId.get(p)?.parent;
    return { ...t, id: newId.get(t.id)!, parent: p === undefined ? undefined : newId.get(p) };
  });
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

let cachedVersion = -1;
export function scanCached(): Target[] {
  watch();
  if (cachedVersion !== actionsVersion()) cache = null;
  cachedVersion = actionsVersion();
  return (cache ??= scanPage());
}

// The box to highlight: a checkbox or radio is drawn with its label, a hidden target at its opener.
export function highlightBox(t: Target): HTMLElement {
  if (t.opener) return t.opener;
  if ((t.kind === "checkbox" || t.kind === "radio") && t.el instanceof HTMLInputElement) return t.el.closest("label") ?? t.el;
  return t.el;
}
