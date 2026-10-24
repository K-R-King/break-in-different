import type { RoleFamily } from "../../shared/taxonomy";
import type { WorkplaceType } from "../../shared/types";
import { sha256 } from "../lib/text";
import { classifyRole, workplaceTypeFrom } from "./rules";
import type { RawListing } from "./sources";
import type { AccommodationForm } from "./accommodationForm";
import { verifyQuote } from "../ai/validators";

export interface NormalizedListing {
  source: string;
  boardToken: string;
  externalId: string;
  title: string;
  roleFamily: RoleFamily;
  location: string;
  workplaceType: WorkplaceType;
  descriptionText: string;
  applyUrl: string;
  sourceUrl: string;
  sourceUpdatedAt?: number;
  accommodationForm?: AccommodationForm;
  contentHash: string;
  dedupeKey: string;
}

// Normalize and keep only CS role families. Returns null for listings to drop.
export async function normalize(raw: RawListing, employerName: string): Promise<NormalizedListing | null> {
  const title = raw.title.replace(/\s+/g, " ").trim();
  const roleFamily = classifyRole(title);
  if (!roleFamily || !raw.applyUrl || !raw.descriptionText.trim()) return null;
  const location = raw.location.replace(/\s+/g, " ").trim();
  const hint = (raw.workplaceHint ?? "").toLowerCase();
  const workplaceType: WorkplaceType = hint.includes("remote")
    ? "remote"
    : hint.includes("hybrid")
      ? "hybrid"
      : hint.includes("on") && hint.includes("site")
        ? "onsite"
        : workplaceTypeFrom(location, raw.descriptionText);
  const descriptionText = raw.descriptionText.slice(0, 60000);
  return {
    source: raw.source,
    boardToken: raw.boardToken,
    externalId: raw.externalId,
    title,
    roleFamily,
    location,
    workplaceType,
    descriptionText,
    applyUrl: raw.applyUrl,
    sourceUrl: raw.sourceUrl,
    sourceUpdatedAt: raw.sourceUpdatedAt && !Number.isNaN(raw.sourceUpdatedAt) ? raw.sourceUpdatedAt : undefined,
    // Kept only when its quote is found word for word in the stored listing text.
    accommodationForm: raw.accommodationForm && verifyQuote(raw.accommodationForm.quote, descriptionText) ? raw.accommodationForm : undefined,
    contentHash: await sha256(`${title}\n${location}\n${descriptionText}`),
    dedupeKey: await sha256(`${employerName.toLowerCase()}|${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${location.toLowerCase()}`),
  };
}
