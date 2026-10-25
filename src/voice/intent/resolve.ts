// A verb said on its own ("enable it", "turn that off", "press it") applies to the current
// selection. When the selection is a region (Filters, Reading and voice), the verb picks among
// the controls inside it that it fits; when that is unclear, the person is asked which one.
import type { Candidate, Verb } from "./match";

export type Resolution = { act: number } | { ask: number; options: number[] } | null;

export interface Resolvable extends Candidate {
  toggle?: boolean; // a button that stays pressed (aria-pressed)
}

function fits(c: Resolvable, verb: Verb): boolean {
  switch (verb) {
    case "on":
      return c.kind === "checkbox" || c.kind === "radio" || (c.kind === "button" && !!c.toggle);
    case "off":
    case "toggle":
      return c.kind === "checkbox" || (c.kind === "button" && !!c.toggle);
    case "select":
      return c.kind === "radio" || c.kind === "checkbox" || c.kind === "select";
    case "press":
    case "do":
      return c.kind === "button" || c.kind === "link" || c.kind === "checkbox" || c.kind === "radio";
    case "go":
      return c.kind === "link" || c.kind === "group";
    default:
      return false;
  }
}

// Among several that fit, the ones the verb would actually change.
function useful(c: Resolvable, verb: Verb): boolean {
  if (verb === "on" || verb === "select") return !c.checked;
  if (verb === "off") return !!c.checked;
  return true;
}

export function resolveVerbOnly(verb: Verb, anchor: number | undefined, candidates: Resolvable[]): Resolution {
  if (anchor === undefined) return null;
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const a = byId.get(anchor);
  if (!a) return null;
  if (a.kind !== "group" && fits(a, verb)) return { act: a.id };

  const within = (c: Candidate, g: number) => {
    for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) if (p === g) return true;
    return false;
  };
  // The selected region, then each region around it, until one has something the verb fits.
  for (let g: number | undefined = a.kind === "group" ? a.id : a.parent; g !== undefined; g = byId.get(g)?.parent) {
    const inside = candidates.filter((c) => c.kind !== "group" && within(c, g) && fits(c, verb));
    if (!inside.length) continue;
    const changeable = inside.filter((c) => useful(c, verb));
    const pool = changeable.length ? changeable : inside;
    if (pool.length === 1) return { act: pool[0].id };
    return { ask: g, options: pool.map((c) => c.id) };
  }
  return null;
}
