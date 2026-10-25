import { describe, expect, it } from "vitest";
import { buildAgentRequest } from "./context";
import type { Target } from "../intent/scan";

const el = () => document.createElement("div");

describe("buildAgentRequest", () => {
  it("offers a private section only by its public name, and nothing inside it", () => {
    const targets: Target[] = [
      { id: 0, kind: "group", el: el(), label: "2. Features to apply", names: ["2. Features to apply", "section 2"] },
      {
        id: 1, kind: "group", el: el(), label: "4. Your disability or neurodivergence",
        names: ["4. Your disability or neurodivergence", "4. About you", "section 4"], private: true, publicName: "4. About you (private)",
      },
      { id: 2, kind: "checkbox", el: el(), label: "ADHD", names: ["ADHD"], parent: 1, private: true, checked: true },
      { id: 3, kind: "group", el: el(), label: "Disclosure", names: ["Disclosure"], private: true },
    ];
    const req = buildAgentRequest({ utterance: "take me to section 4", targets, guidance: "brief", history: [] });
    expect(req.targets).toEqual([
      expect.objectContaining({ id: 0, label: "2. Features to apply" }),
      { id: 1, kind: "group", label: "4. About you (private)", names: [] },
    ]);
    expect(JSON.stringify(req)).not.toMatch(/disabilit|neurodivergen|ADHD/i);
  });
});
