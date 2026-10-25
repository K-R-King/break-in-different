// Keyterm prompting for Cartesia speech-to-text (up to 100 terms, 1,200 characters; sent when the
// connection opens): the command phrases, then the names of what is on the page now, so short
// commands like "enable it" are not heard as other words.
import { scanCached } from "./scan";

const COMMANDS = [
  "enable it",
  "disable it",
  "turn it on",
  "turn it off",
  "toggle it",
  "select",
  "press",
  "go to",
  "scroll down",
  "scroll up",
  "settings",
  "job search",
  "application tracker",
  "profile",
];

export function voiceKeyterms(): string[] {
  const out = new Set(COMMANDS);
  let budget = 1200 - COMMANDS.join("").length;
  for (const t of scanCached()) {
    const name = t.label.trim();
    if (out.size >= 100) break;
    if (!name || name.length > 40 || out.has(name) || name.length > budget) continue;
    out.add(name);
    budget -= name.length;
  }
  return [...out];
}
