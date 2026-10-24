// Fixed templates: the fallback when Claude is unavailable or its output fails validation.
import { ACCOMMODATION_LABELS, type AccommodationCode } from "../../shared/taxonomy";
import { DISCLOSURE_TOKEN, LINK_TOKEN } from "./validators";

export function emailTemplate(opts: {
  jobTitle: string;
  employerName: string;
  codes: AccommodationCode[];
  disclose: boolean;
}): { subject: string; body: string } {
  const n = opts.codes.length;
  const what = n === 1 ? "one workplace accommodation" : `${numberWord(n)} workplace accommodations`;
  const lines = [
    "Hello,",
    "",
    `I'm applying for the ${opts.jobTitle} role at ${opts.employerName} and would like to ask about ${what}:`,
    "",
    ...opts.codes.map((c) => `• ${ACCOMMODATION_LABELS[c]}`),
    "",
  ];
  if (opts.disclose) lines.push(DISCLOSURE_TOKEN, "");
  lines.push(
    "These would help me do my best work. I am happy to discuss the details in writing.",
    "",
    `My application: ${LINK_TOKEN}`,
    "",
    "Thank you,",
    "[Your name]",
  );
  return { subject: `Accommodation request: ${opts.jobTitle} application`, body: lines.join("\n") };
}

// Disclosure text is built from the user's own selection or words; it never passes through Claude.
export function disclosureText(conditionLabels: string[], freeText: string): string {
  const own = freeText.trim();
  if (own) return own;
  if (!conditionLabels.length) return "";
  return `I'd like to share that I have ${joinList(conditionLabels)}.`;
}

// The user's extra request is inserted verbatim by code, never sent to Claude.
export function fillTokens(body: string, applyUrl: string, disclosure: string, extraRequest = ""): string {
  let out = body;
  const extra = extraRequest.trim();
  if (extra) {
    const lines = out.split("\n");
    const i = lines.findIndex((l) => l.includes(LINK_TOKEN));
    lines.splice(i < 0 ? lines.length : i, 0, `I would also like to ask about: ${extra}`, "");
    out = lines.join("\n");
  }
  out = out.split(LINK_TOKEN).join(applyUrl);
  if (disclosure) out = out.split(DISCLOSURE_TOKEN).join(disclosure);
  else out = out.split(`${DISCLOSURE_TOKEN}\n\n`).join("").split(DISCLOSURE_TOKEN).join("");
  return out;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven"][n] ?? String(n);
}
