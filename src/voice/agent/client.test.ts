import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAgent } from "./client";
import type { AgentLine } from "./protocol";

function streamOf(chunks: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        c.close();
      },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("streamAgent", () => {
  it("hands over each line when complete, and speaks finished sentences before the line ends", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamOf(["ACT 4", "7 on\nSAY Done. Want to", " request accommodations", " next?\n"])));
    const got: AgentLine[] = [];
    await streamAgent({}, "token", (l) => got.push(l), new AbortController().signal);
    expect(got).toEqual([
      { type: "act", id: 47, verb: "on" },
      { type: "say", text: "Done.", partial: true },
      { type: "say", text: "Want to request accommodations next?" },
    ]);
  });

  it("fails on an unusable response so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    await expect(streamAgent({}, "token", () => undefined, new AbortController().signal)).rejects.toThrow("503");
  });
});
