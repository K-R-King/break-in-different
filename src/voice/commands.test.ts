import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";

describe("voice commands (A14)", () => {
  it.each([
    ["Go to jobs.", { type: "navigate", to: "/jobs" }],
    ["go to profile", { type: "navigate", to: "/profile" }],
    ["Go to tracker", { type: "navigate", to: "/tracker" }],
    ["Open job", { type: "open" }],
    ["next job", { type: "next" }],
    ["previous job", { type: "previous" }],
    ["read this", { type: "read" }],
    ["Stop.", { type: "stop" }],
    ["save", { type: "save" }],
    ["apply", { type: "apply" }],
    ["scroll down", { type: "scrollDown" }],
    ["help", { type: "help" }],
  ])("%s", (said, cmd) => expect(parseCommand(said)).toEqual(cmd));
  it("returns null for anything else", () => expect(parseCommand("what's the weather")).toBeNull());
});
