// Calls the voice assistant (Convex HTTP action /voice/agent) and hands back each instruction
// line the moment it is complete, so actions start before the reply is finished.
import { LineSplitter, parseLine, type AgentLine } from "./protocol";

// A SAY line is spoken sentence by sentence as it streams: a finished sentence is not held back
// waiting for the rest of the line.
function sentenceEnd(text: string): number {
  let end = -1;
  for (const m of text.matchAll(/[.!?](?=\s)/g)) end = m.index + 1;
  return end;
}

function siteUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_CONVEX_SITE_URL) return env.VITE_CONVEX_SITE_URL.replace(/\/$/, "");
  // Self-hosted Convex serves HTTP actions on the port after the API's (3210 -> 3211).
  return (env.VITE_CONVEX_URL ?? "").replace(/:3210(?=\/|$)/, ":3211").replace(/\/$/, "");
}

export async function streamAgent(body: unknown, token: string, onLine: (line: AgentLine) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${siteUrl()}/voice/agent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const lines = new LineSplitter();
  let spoken = 0; // characters of the current SAY line already handed over
  const emit = (l: string) => {
    const parsed = parseLine(l);
    if (parsed?.type === "say" && spoken) {
      const rest = l.trim().slice(4 + spoken).trim();
      if (rest) onLine({ type: "say", text: rest });
    } else if (parsed) onLine(parsed);
    spoken = 0;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const l of lines.push(decoder.decode(value, { stream: true }))) emit(l);
    const part = lines.partial.trimStart();
    if (/^SAY\s/i.test(part)) {
      const body = part.slice(4);
      const end = sentenceEnd(body);
      if (end > spoken) {
        const sentence = body.slice(spoken, end).trim();
        spoken = end;
        if (sentence) onLine({ type: "say", text: sentence, partial: true });
      }
    }
  }
  for (const l of lines.flush()) emit(l);
}
