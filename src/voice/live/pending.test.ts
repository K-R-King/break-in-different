import { describe, expect, it } from "vitest";
import { PendingText } from "./pending";

describe("PendingText", () => {
  it("keeps the whole command across turns split by pauses", () => {
    const p = new PendingText();
    expect(p.update("enable word")).toBe("enable word");
    expect(p.end("enable word highlighting")).toBe("enable word highlighting");
    expect(p.update("when doing")).toBe("enable word highlighting when doing");
    expect(p.end("when doing text to speech.")).toBe("enable word highlighting when doing text to speech.");
  });

  it("drops consumed text, including the used part of a turn still in progress", () => {
    const p = new PendingText();
    p.end("open settings");
    p.update("show remote");
    expect(p.consume()).toBe("");
    expect(p.update("show remote jobs please")).toBe("jobs please");
    expect(p.end("show remote jobs please now")).toBe("jobs please now");
    p.update("next");
    expect(p.text).toBe("jobs please now next");
  });

  it("clear forgets everything", () => {
    const p = new PendingText();
    p.end("hello");
    p.update("there");
    p.clear();
    expect(p.text).toBe("");
  });
});
