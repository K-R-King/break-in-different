// The voice assistant's streamed reply, one instruction per line (convex/ai/voiceAgent.ts):
//   ACT <id> <verb>   TYPE <id> <text>   ASK <id> <verb>   SAY <text>
// Lines are acted on as soon as each one is complete.
import type { Verb } from "../intent/match";

const VERBS = new Set(["on", "off", "toggle", "select", "press", "go", "none"]);

export type AgentLine =
  | { type: "act"; id: number; verb: Verb | null }
  | { type: "type"; id: number; text: string }
  | { type: "ask"; id: number; verb: Verb | null }
  | { type: "say"; text: string; partial?: boolean } // partial: one sentence of a line still streaming
  | { type: "error" };

const verbOf = (v: string): Verb | null => (v === "none" ? null : (v as Verb));

export function parseLine(raw: string): AgentLine | null {
  const line = raw.trim();
  if (line === "ERROR") return { type: "error" };
  let m = /^(ACT|ASK)\s+(\d+)\s+(\w+)\s*$/i.exec(line);
  if (m && VERBS.has(m[3].toLowerCase())) return { type: m[1].toUpperCase() === "ACT" ? "act" : "ask", id: Number(m[2]), verb: verbOf(m[3].toLowerCase()) };
  m = /^TYPE\s+(\d+)\s+(.+)$/i.exec(line);
  if (m) return { type: "type", id: Number(m[1]), text: m[2].trim().replace(/^"(.*)"$/, "$1") };
  m = /^SAY\s+(.+)$/i.exec(line);
  if (m) return { type: "say", text: m[1].trim() };
  return null;
}

// Splits a text stream into complete lines.
export class LineSplitter {
  private buf = "";
  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    return lines.filter((l) => l.trim());
  }
  // The line still being written.
  get partial(): string {
    return this.buf;
  }
  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}
