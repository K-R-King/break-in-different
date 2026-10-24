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
    const out = canonicalize([
      t(0, "group", ["Filters panel"]),
      t(1, "group", ["Filters"], 0),
      t(2, "radio", ["Remote"], 1),
      t(3, "radio", ["Any"], 1),
    ]);
    expect(out.map((x) => x.label)).toEqual(["Filters", "Remote", "Any"]);
    expect(out[0].names).toEqual(["Filters", "Filters panel"]);
    expect(out[1].parent).toBe(0);
  });

  it("merges links to the same page into the first", () => {
    const out = canonicalize([t(0, "link", ["Jobs Listing"], undefined, el("a", "http://x/jobs")), t(1, "link", ["Go to jobs"], undefined, el("a", "http://x/jobs"))]);
    expect(out).toHaveLength(1);
    expect(out[0].names).toEqual(["Jobs Listing", "Go to jobs"]);
  });

  it("keeps text-only regions for reading", () => {
    expect(canonicalize([t(0, "group", ["About the role"])])).toHaveLength(1);
  });
});
