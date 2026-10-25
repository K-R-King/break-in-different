import { describe, expect, it } from "vitest";
import { LineSplitter, parseLine } from "./protocol";

describe("parseLine", () => {
  it("reads each instruction", () => {
    expect(parseLine("ACT 12 on")).toEqual({ type: "act", id: 12, verb: "on" });
    expect(parseLine("ACT 3 none")).toEqual({ type: "act", id: 3, verb: null });
    expect(parseLine("ask 7 select")).toEqual({ type: "ask", id: 7, verb: "select" });
    expect(parseLine('TYPE 40 "React Native"')).toEqual({ type: "type", id: 40, text: "React Native" });
    expect(parseLine("SAY Do you mean the ML Engineer role at Anthropic?")).toEqual({ type: "say", text: "Do you mean the ML Engineer role at Anthropic?" });
    expect(parseLine("ERROR")).toEqual({ type: "error" });
  });

  it("ignores anything else", () => {
    expect(parseLine("ACT 12 explode")).toBeNull();
    expect(parseLine("Sure! Here you go.")).toBeNull();
    expect(parseLine("")).toBeNull();
  });
});

describe("LineSplitter", () => {
  it("yields lines as soon as they are complete", () => {
    const s = new LineSplitter();
    expect(s.push("ACT 1 o")).toEqual([]);
    expect(s.push("n\nSAY Sav")).toEqual(["ACT 1 on"]);
    expect(s.push("ed.\n")).toEqual(["SAY Saved."]);
    expect(s.push("SAY Next?")).toEqual([]);
    expect(s.flush()).toEqual(["SAY Next?"]);
  });
});
