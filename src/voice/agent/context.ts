// What the voice assistant is told about the page: its purpose, the controls (with ids from the
// scan), their state, and the visible text of the main area. Nothing marked private (disability
// details) or dangerous is included, except a private region's public name so the assistant can
// take the person there; the size is capped so replies stay fast.
import type { Target } from "../intent/scan";
import type { Guidance } from "./settings";
import { pageInfo } from "./pages";

const MAX_TARGETS = 120; // fewer, most relevant first: less for the model to read, faster replies
const MAX_TEXT = 1500;

export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

function stateOf(t: Target): string | undefined {
  const el = t.el;
  if (t.run && t.kind === "radio") return t.checked ? "selected" : undefined; // dropdown option
  if (t.kind === "checkbox") return t.checked ? "on" : "off";
  if (t.kind === "radio") return t.checked ? "selected" : "not selected";
  if (t.kind === "button" && t.toggle) return t.checked ? "on" : "off";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value ? `value: ${el.value.slice(0, 80)}` : "empty";
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text;
  return undefined;
}

function groupPath(t: Target, all: Target[]): string | undefined {
  const names: string[] = [];
  for (let p = t.parent; p !== undefined && names.length < 2; p = all[p]?.parent) if (all[p]) names.unshift(all[p].label);
  return names.length ? names.join(" › ") : undefined;
}

// Visible text of the page's main area, without private regions.
export function mainText(): string {
  const root = document.querySelector<HTMLElement>("[data-voice-primary]") ?? document.querySelector<HTMLElement>("main");
  if (!root) return "";
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-voice-private], script, style, svg, [aria-hidden='true']").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

export function buildAgentRequest(opts: {
  utterance: string;
  targets: Target[];
  selection?: number;
  guesses?: number[];
  guidance: Guidance;
  history: AgentTurn[];
}) {
  const { targets } = opts;
  // Never private or dangerous; not the page already open (nothing to do there). A private region
  // with a public name is only somewhere to go: that name and nothing more.
  const shell = (t: Target) => !!t.private && t.kind === "group" && !!t.publicName;
  const allowed = (t: Target) => (!t.private || shell(t)) && !t.danger && !t.current;
  // Most relevant first: keyword guesses, the selection, what is on screen, then the rest.
  const first = new Set([...(opts.guesses ?? []), ...(opts.selection !== undefined ? [opts.selection] : [])]);
  const ranked = [
    ...targets.filter((t) => first.has(t.id)),
    ...targets.filter((t) => !first.has(t.id) && (t.inView || t.run || t.kind === "group")),
    ...targets.filter((t) => !first.has(t.id) && !(t.inView || t.run || t.kind === "group")),
  ].filter(allowed);
  const info = pageInfo(location.pathname);
  return {
    utterance: opts.utterance,
    page: { path: location.pathname, title: info.name, hint: info.hint, text: mainText() },
    guidance: opts.guidance,
    selection: opts.selection,
    guesses: opts.guesses,
    targets: ranked.slice(0, MAX_TARGETS).map((t) => {
      if (shell(t)) return { id: t.id, kind: t.kind, label: t.publicName!, names: [] };
      return {
        id: t.id,
        kind: t.run && t.kind === "radio" ? "option" : t.kind,
        label: t.label,
        names: t.names.filter((n) => n !== t.label).slice(0, 3),
        group: groupPath(t, targets),
        state: stateOf(t),
        say: t.el.dataset.voiceSay,
        confirm: t.el.hasAttribute("data-voice-confirm") || undefined,
      };
    }),
    history: opts.history.slice(-8),
  };
}
