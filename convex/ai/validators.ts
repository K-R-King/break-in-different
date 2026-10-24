// Guards on every piece of AI output (AI guardrails 2–4). Pure functions, unit tested.
import { ACCOMMODATION_CODES, CONDITION_LABELS, type AccommodationCode } from "../../shared/taxonomy";
import type { AccommodationInfo, MatchFactors } from "../../shared/types";
import { normalizeWhitespace } from "../lib/text";
import { findSkillsInText, skillKey } from "../match/skills";

// ---------- Accommodation evidence ----------

export interface ExtractedAccommodation {
  code: AccommodationCode;
  quote: string;
  kind: "stated" | "ambiguous"; // ambiguous = boilerplate or unclear wording
  contradicts: boolean;
}

// A quote must appear verbatim (after whitespace normalization) in the job text,
// otherwise it is dropped: we never show a claim the listing does not make.
export function verifyAccommodations(items: ExtractedAccommodation[], descriptionText: string): AccommodationInfo[] {
  const haystack = normalizeWhitespace(descriptionText);
  const out: AccommodationInfo[] = [];
  const seen = new Set<AccommodationCode>();
  for (const item of items) {
    if (!(ACCOMMODATION_CODES as readonly string[]).includes(item.code) || seen.has(item.code)) continue;
    const quote = item.quote.trim();
    if (quote.length < 8 || !haystack.includes(normalizeWhitespace(quote))) continue;
    seen.add(item.code);
    if (item.kind === "stated" || item.contradicts) {
      out.push({ code: item.code, label: "stated", evidence: quote, evidenceSource: "listing", contradicts: item.contradicts || undefined });
    } else {
      out.push({ code: item.code, label: "unverified", evidence: quote, evidenceSource: "listing", note: "Not confirmed. Ask the employer." });
    }
  }
  return out;
}

export function verifyQuote(quote: string | undefined, descriptionText: string): boolean {
  if (!quote || quote.trim().length < 3) return false;
  return normalizeWhitespace(descriptionText).includes(normalizeWhitespace(quote));
}

// ---------- Match explanation ----------

// The explanation may use only numbers and skill names present in the factor data.
export function explanationIsGrounded(text: string, f: MatchFactors, score: number): boolean {
  if (!text || text.length > 400) return false;
  const allowedNumbers = new Set<string>([
    String(score),
    String(Math.round(f.skills.ratio * 100)),
    String(f.skills.matched.length),
    String(f.skills.missing.length),
    String(f.skills.matched.length + f.skills.missing.length),
    String(f.conflicts.length),
    "25",
    "100",
  ]);
  for (const n of text.match(/\d+(\.\d+)?/g) ?? []) if (!allowedNumbers.has(n)) return false;
  const allowedSkills = new Set([...f.skills.matched, ...f.skills.missing].map(skillKey));
  for (const s of findSkillsInText(text)) if (!allowedSkills.has(skillKey(s))) return false;
  return true;
}

// ---------- Email ----------

export const DISCLOSURE_TOKEN = "[DISCLOSURE]";
export const LINK_TOKEN = "[APPLICATION_LINK]";

const ACCOMMODATION_KEYWORDS: Record<AccommodationCode, string[]> = {
  remote_work: ["remote"],
  flexible_hours: ["flexible hours", "flexible working hours", "flexible schedule", "flexible work hours"],
  wheelchair_accessible: ["wheelchair"],
  written_alternatives: ["written alternative", "instead of phone", "rather than phone"],
  quiet_workspace: ["quiet", "low-distraction", "low distraction"],
  assistive_communication_tools: ["assistive communication"],
  assistive_software: ["assistive software", "screen reader", "text-to-speech", "voice control", "dyslexia-friendly"],
};

// Health or condition words Claude must never write (disclosure text is inserted by code).
const HEALTH_TERMS = [
  "adhd", "autism", "autistic", "dyslexia", "dyslexic", "blind", "low vision", "visually impaired",
  "cerebral palsy", "arthritis", "spinal", "parkinson", "disability", "disabilities", "disabled",
  "diagnosis", "diagnosed", "neurodivergent", "neurodiverse", "impairment", "impaired", "chronic",
  "illness", "mental health", "anxiety", "depression", "deaf", "medical condition", "health condition",
];

export function emailIsValid(
  draft: { subject: string; body: string },
  selected: AccommodationCode[],
  disclose: boolean,
  ignore: string[] = [], // job title and employer name, which may contain any words
): boolean {
  const body = draft.body ?? "";
  const subject = draft.subject ?? "";
  if (!body.trim() || !subject.trim() || body.length > 4000 || subject.length > 200) return false;

  const disclosureCount = body.split(DISCLOSURE_TOKEN).length - 1;
  if (disclose ? disclosureCount !== 1 : disclosureCount !== 0) return false;
  if (body.split(LINK_TOKEN).length - 1 !== 1) return false;
  if (/https?:\/\//i.test(body + subject)) return false; // links are inserted by code only

  let text = `${subject}\n${body}`.toLowerCase();
  for (const phrase of ignore) if (phrase.trim()) text = text.split(phrase.toLowerCase()).join(" ");
  // Every selected accommodation is named; no other accommodation is.
  for (const code of ACCOMMODATION_CODES) {
    const named = ACCOMMODATION_KEYWORDS[code].some((k) => text.includes(k));
    if (selected.includes(code) !== named) return false;
  }
  // Selected accommodation phrases may contain health-like words; remove them before the scan.
  for (const code of selected) for (const k of ACCOMMODATION_KEYWORDS[code]) text = text.split(k).join(" ");
  return !HEALTH_TERMS.some((t) => new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(text));
}

export { ACCOMMODATION_KEYWORDS };

// ---------- Interview practice ----------

// Long job titles make greetings long, so this is generous; the prompt asks for under 60 words.
export const PRACTICE_LINE_MAX = 700;

const PRACTICE_TERMS = [...new Set([...HEALTH_TERMS, ...Object.values(CONDITION_LABELS).map((l) => l.toLowerCase())])]
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const PRACTICE_TERM_SOURCE = `(^|[^a-z])(${PRACTICE_TERMS.join("|")})(?=[^a-z]|$)`;

// Candidate answers are free text, so condition words are replaced before any answer reaches Claude.
export function redactHealthTerms(text: string): string {
  return text.replace(new RegExp(PRACTICE_TERM_SOURCE, "gi"), (_m, pre: string) => `${pre}[removed]`);
}

// Why an interviewer line or feedback sentence is rejected (for logs: a class, never the text).
export function practiceLineProblem(text: string, max = PRACTICE_LINE_MAX): "EMPTY" | "TOO_LONG" | "LINK" | "HEALTH_TERM" | null {
  const t = (text ?? "").trim();
  if (!t) return "EMPTY";
  if (t.length > max) return "TOO_LONG";
  if (/https?:\/\/|www\./i.test(t)) return "LINK";
  if (new RegExp(PRACTICE_TERM_SOURCE, "i").test(t)) return "HEALTH_TERM";
  return null;
}

// An interviewer line or feedback sentence: short, no links, no health or condition words.
export function practiceLineIsValid(text: string, max = PRACTICE_LINE_MAX): boolean {
  return practiceLineProblem(text, max) === null;
}
