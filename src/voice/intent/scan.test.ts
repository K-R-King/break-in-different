import { describe, expect, it } from "vitest";
import { canonicalize, type Target } from "./scan";

const el = (tag = "div", href?: string) => {
  const e = document.createElement(tag);
  if (href) (e as HTMLAnchorElement).href = href;
  return e;
};
const t = (id: number, kind: Target["kind"], names: string[], parent?: number, e = el()): Target => ({ id, kind, names, label: names[0], parent, el: e });

describe("canonicalize", () => {
  it("merges a section around a single box into the box, keeping both names", () => {
    const out = canonicalize([t(0, "group", ["Your name"]), t(1, "text", ["Full name"], 0)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "text", label: "Full name", names: ["Full name", "Your name"], parent: undefined });
  });

  it("keeps a group with several controls, and only the tightest of nested wrappers", () => {
    const inner = el();
    const out = canonicalize([
      t(0, "group", ["4. Your disability or neurodivergence"]),
      t(1, "group", ["Select any that apply"], 0, inner),
      t(2, "checkbox", ["ADHD"], 1),
      t(3, "checkbox", ["Dyslexia"], 1),
    ]);
    // The inner (tighter) box survives, named by the outer heading people see.
    expect(out.map((x) => x.label)).toEqual(["4. Your disability or neurodivergence", "ADHD", "Dyslexia"]);
    expect(out[0].names).toEqual(["4. Your disability or neurodivergence", "Select any that apply"]);
    expect(out[0].el).toBe(inner);
    expect(out[1].parent).toBe(0);
  });

  it("merges links to the same page into the first", () => {
    const out = canonicalize([t(0, "link", ["Jobs Listing"], undefined, el("a", "http://x/jobs")), t(1, "link", ["Go to jobs"], undefined, el("a", "http://x/jobs"))]);
    expect(out).toHaveLength(1);
    expect(out[0].names).toEqual(["Jobs Listing", "Go to jobs"]);
  });

  it("names a section after its numbered table-of-contents link", () => {
    const sec = el("section");
    sec.id = "s4";
    const nav = el("nav");
    const link = el("a", "#s4");
    link.setAttribute("href", "#s4");
    nav.append(link);
    document.body.append(sec, nav);
    const out = canonicalize([t(0, "group", ["4. Your disability or neurodivergence"], undefined, sec), t(1, "checkbox", ["ADHD"], 0), t(2, "checkbox", ["Dyslexia"], 0), t(3, "link", ["4. About you"], undefined, link)]);
    expect(out[0].names).toEqual(["4. Your disability or neurodivergence", "4. About you", "section 4"]);
    sec.remove();
    nav.remove();
  });

  it("keeps text-only regions for reading", () => {
    expect(canonicalize([t(0, "group", ["About the role"])])).toHaveLength(1);
  });
});
