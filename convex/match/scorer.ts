// TypeScript scorer (fallback engine). agent/scorer.py implements the same rules;
// both run shared/fixtures/scorer-cases.json so they cannot drift.
//
// Score = 100 × (0.60 S + 0.30 R + 0.10 L) − P
import { ROLE_ADJACENCY, type ChosenRole, type RoleFamily } from "../../shared/taxonomy";
import type {
  AccommodationCode,
  AccommodationCoverage,
  CandidateJob,
  MatchFactors,
  MatchResult,
  MatchSnapshot,
} from "../../shared/types";
import { canonicalSkill, skillKey } from "./skills";

export const CONFLICT_PENALTY = 25;
export const CONFLICT_CAP = 40;

export function roleMatch(roleIds: ChosenRole[], family: RoleFamily): "exact" | "adjacent" | null {
  if ((roleIds as string[]).includes(family)) return "exact";
  if (roleIds.some((r) => ROLE_ADJACENCY[r].includes(family))) return "adjacent";
  return null;
}

export function scoreJob(
  snapshot: MatchSnapshot,
  job: CandidateJob,
  engine: MatchResult["engine"] = "fallback",
): MatchResult | null {
  const role = roleMatch(snapshot.roleIds, job.roleFamily);
  if (!role) return null; // outside chosen and adjacent families: not shown

  // S: skills
  const userSkills = new Set(snapshot.skills.map(skillKey));
  let total = 0;
  let matchedWeight = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of job.skills) {
    const w = s.level === "required" ? 1 : 0.5;
    total += w;
    if (userSkills.has(skillKey(s.name))) {
      matchedWeight += w;
      matched.push(canonicalSkill(s.name));
    } else {
      missing.push(canonicalSkill(s.name));
    }
  }
  const limitedInfo = job.skills.length === 0;
  const S = limitedInfo ? 0.5 : matchedWeight / total;

  // R: role
  const R = role === "exact" ? 1 : 0.5;

  // L: location
  const userLoc = snapshot.locationText.trim().toLowerCase();
  let fit: 0 | 1 = 0;
  let reason = "";
  if (job.workplaceType === "remote") {
    fit = 1;
    reason = "job is remote";
  } else if (!userLoc) {
    fit = 1;
    reason = "no location set";
  } else if (job.location.toLowerCase().includes(userLoc)) {
    fit = 1;
    reason = `location matches "${snapshot.locationText.trim()}"`;
  } else {
    reason = `not in "${snapshot.locationText.trim()}"`;
  }

  // P: explicit, quoted contradictions of required accommodations only
  const conflicts: MatchFactors["conflicts"] = [];
  const coverage: AccommodationCoverage = { requiredStated: [], requiredNotMentioned: [], requiredConflicting: [] };
  for (const code of snapshot.requiredAccommodations) {
    const info = job.accommodations.find((a) => a.code === code);
    if (info?.contradicts && info.evidence) {
      conflicts.push({ code, quote: info.evidence });
      coverage.requiredConflicting.push(code);
    } else if (info && (info.label === "stated" || info.label === "verified")) {
      coverage.requiredStated.push(code);
    } else {
      coverage.requiredNotMentioned.push(code);
    }
  }
  const P = Math.min(conflicts.length * CONFLICT_PENALTY, CONFLICT_CAP);

  const raw = 100 * (0.6 * S + 0.3 * R + 0.1 * fit) - P;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const factors: MatchFactors = {
    skills: { ratio: round2(S), matched, missing, limitedInfo },
    role: { type: role },
    location: { fit, reason },
    conflicts,
  };
  return {
    jobId: job.jobId,
    score,
    factors,
    accommodationCoverage: coverage,
    explanation: templateExplanation(factors),
    engine,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Fixed, data-only sentence. Used when Claude is unavailable or its text fails the check.
export function templateExplanation(f: MatchFactors): string {
  const parts: string[] = [];
  if (f.skills.limitedInfo) parts.push("The listing names no specific skills (limited skill information)");
  else {
    const n = f.skills.matched.length + f.skills.missing.length;
    let s = `Matches ${f.skills.matched.length} of ${n} listed skills`;
    if (f.skills.missing.length) s += ` (missing: ${f.skills.missing.slice(0, 3).join(", ")})`;
    parts.push(s);
  }
  parts.push(f.role.type === "exact" ? "exact role match" : "close role match");
  parts.push(f.location.fit ? `location fits (${f.location.reason})` : `location does not fit (${f.location.reason})`);
  if (f.conflicts.length) parts.push(`${f.conflicts.length} required accommodation conflict${f.conflicts.length > 1 ? "s" : ""}`);
  return parts.join(", ") + ".";
}

export function coverageLine(c: AccommodationCoverage): string {
  const total = c.requiredStated.length + c.requiredNotMentioned.length + c.requiredConflicting.length;
  if (!total) return "";
  const bits = [`Stated: ${c.requiredStated.length} of ${total}.`];
  if (c.requiredNotMentioned.length) bits.push(`Not mentioned: ${c.requiredNotMentioned.length}.`);
  if (c.requiredConflicting.length) bits.push(`Conflicts: ${c.requiredConflicting.length}.`);
  return bits.join(" ");
}

export type { AccommodationCode };
