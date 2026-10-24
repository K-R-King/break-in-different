// Deterministic listing rules: role-family filter (always), plus the fallback extraction
// used when Claude is unavailable. Rules only ever produce verbatim quotes.
import type { AccommodationCode, ExperienceLevel, RoleFamily } from "../../shared/taxonomy";
import type { JobSkill, WorkplaceType } from "../../shared/types";
import type { ExtractedAccommodation } from "../ai/validators";
import { findSkillsInText } from "../match/skills";

const EXCLUDE = /\b(manager|director|head of|vp|vice president|principal|staff|recruit|sales|account executive|marketing|designer|product manager|support|technician|counsel|analyst)\b/i;

// Keep only computer science role families. Returns null for everything else.
export function classifyRole(title: string): RoleFamily | null {
  const t = title.toLowerCase();
  if (EXCLUDE.test(t) && !/engineer|developer|scientist/.test(t.replace(EXCLUDE, ""))) return null;
  if (/\b(machine learning|ml|ai)\b.*\b(engineer|developer)\b|\bmlops\b/.test(t)) return "ml_engineer";
  if (/\bapplied (ml |ai )?scientist|research scientist|research engineer\b/.test(t)) return "applied_scientist";
  if (/\bdata scientist\b/.test(t)) return "data_scientist";
  if (/full[\s-]?stack/.test(t)) return "full_stack_developer";
  if (/\b(front[\s-]?end|frontend|web|ui) (engineer|developer)\b/.test(t)) return "frontend_engineer";
  if (/\b(back[\s-]?end|backend|api|platform|infrastructure) (engineer|developer)\b/.test(t)) return "backend_engineer";
  if (/\bsoftware (engineer|developer)\b|\bswe\b|\bsoftware development engineer\b/.test(t)) return "software_engineer";
  return null;
}

export function workplaceTypeFrom(location: string, text: string): WorkplaceType {
  const l = location.toLowerCase();
  if (/\bremote\b/.test(l)) return "remote";
  if (/\bhybrid\b/.test(l)) return "hybrid";
  const t = text.toLowerCase();
  if (/\bfully remote\b|\b100% remote\b|\bremote[- ]first\b/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon[- ]?site\b|\bin[- ]office\b/.test(t)) return "onsite";
  return l ? "onsite" : "unknown";
}

export function experienceFromRules(title: string, text: string): { level: ExperienceLevel; evidence?: string } {
  const sources = [title, ...sentences(text)];
  const rules: [RegExp, ExperienceLevel][] = [
    [/\bintern(ship)?\b/i, "internship"],
    [/\bnew grad(uate)?\b|\brecent graduate\b|\bearly career\b|\buniversity grad/i, "new_grad"],
    [/\b(junior|entry[- ]level|associate)\b|\b0\s*[-–]\s*2 years\b/i, "entry_level"],
    [/\b(senior|sr\.?|lead|staff|principal)\b|\b([3-9]|1\d)\+? years\b/i, "experienced"],
  ];
  for (const [re, level] of rules) {
    const hit = sources.find((s) => re.test(s));
    if (hit) return { level, evidence: hit === title ? undefined : hit.slice(0, 300) };
  }
  return { level: "not_stated" };
}

export function skillsFromRules(text: string): JobSkill[] {
  return findSkillsInText(text).slice(0, 25).map((name) => ({ name, level: "required" as const }));
}

const ACCOMMODATION_RULES: { code: AccommodationCode; stated: RegExp; contradicts?: RegExp }[] = [
  {
    code: "remote_work",
    // Conservative: only unambiguous wording counts when Claude is unavailable.
    stated: /\b(fully remote|100% remote|remote[- ]first company|this (role|position|job) is (fully )?remote|this is a (fully )?remote (role|position))\b/i,
    contradicts: /\b(on[- ]?site|in[- ]office|in the office)\b[^.]{0,40}\b(five|5|four|4) days\b|\b(five|5) days a week\b[^.]{0,30}\b(office|on[- ]?site)\b|\bno remote\b|\bnot (a )?remote\b/i,
  },
  { code: "flexible_hours", stated: /\b(flexible (working |work )?(hours|schedule)|core hours|work[- ]life flexibility|async(hronous)? (work|culture))\b/i },
  { code: "wheelchair_accessible", stated: /\bwheelchair[- ]accessible\b/i },
  { code: "written_alternatives", stated: /\b(written (communication|interview|alternative)|async(hronous)? interview|take[- ]home)\b/i },
  { code: "quiet_workspace", stated: /\b(quiet (room|space|workspace)|low[- ]distraction|focus rooms?)\b/i },
  { code: "assistive_communication_tools", stated: /\bassistive communication\b/i },
  { code: "assistive_software", stated: /\b(assistive (technology|software)|screen readers?)\b/i },
];

export function accommodationsFromRules(text: string): ExtractedAccommodation[] {
  const out: ExtractedAccommodation[] = [];
  const all = sentences(text);
  for (const rule of ACCOMMODATION_RULES) {
    const conflict = rule.contradicts && all.find((s) => rule.contradicts!.test(s));
    if (conflict) {
      out.push({ code: rule.code, quote: conflict, kind: "stated", contradicts: true });
      continue;
    }
    const hit = all.find((s) => rule.stated.test(s));
    if (hit) out.push({ code: rule.code, quote: hit, kind: "stated", contradicts: false });
  }
  return out;
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[•\-*]\s*/, "").trim())
    .filter((s) => s.length >= 8 && s.length <= 400);
}

export function summaryFromText(text: string): string {
  const first = sentences(text).slice(0, 2).join(" ");
  return first.length > 280 ? `${first.slice(0, 277)}…` : first;
}
