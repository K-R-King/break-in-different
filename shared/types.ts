// Shared types (Build Plan section 12). Imported by the front end, Convex and fixtures.
// The Python agent follows the MatchRequest / MatchResult JSON shapes below.
import type {
  AccommodationCode,
  AccommodationLabel,
  ApplicationStatus,
  ChosenRole,
  ExperienceLevel,
  FontOption,
  RoleFamily,
} from "./taxonomy";

export type { AccommodationCode, AccommodationLabel, ApplicationStatus, ChosenRole, ExperienceLevel, RoleFamily };

export interface InterfacePrefs {
  font: FontOption;
  textScale: number; // 1 to 2
  lineHeight: number; // 1.2 to 2.4
  letterSpacing: number; // em, 0 to 0.12
  wordSpacing: number; // em, 0 to 0.16
  ttsHighlight: boolean;
  voiceReader: boolean;
  voiceNav: boolean;
  reduceMotion: boolean;
  contrast: "standard" | "high";
}

export const DEFAULT_INTERFACE: InterfacePrefs = {
  font: "system",
  textScale: 1,
  lineHeight: 1.5,
  letterSpacing: 0,
  wordSpacing: 0,
  ttsHighlight: false,
  voiceReader: false,
  voiceNav: false,
  reduceMotion: false,
  contrast: "standard",
};

export type RemotePreference = "remote" | "onsite" | "either";

export interface ProfileInput {
  skills: string[];
  roleIds: ChosenRole[];
  requiredAccommodations: AccommodationCode[];
  preferredAccommodations: AccommodationCode[];
  interface: InterfacePrefs;
  locationText: string;
  remotePreference: RemotePreference;
  fullName?: string;
}

// Sign-off placeholder in drafted emails; replaced with the profile's full name when one is saved.
export const NAME_PLACEHOLDER = "[Your name]";

export interface Profile extends ProfileInput {
  version: number;
  updatedAt: number;
}

export interface JobSkill {
  name: string;
  level: "required" | "preferred";
}

export interface AccommodationInfo {
  code: AccommodationCode;
  label: AccommodationLabel;
  evidence?: string; // required when label is 'stated'; verbatim from descriptionText
  evidenceSource?: "listing" | "curated";
  sourceUrl?: string; // required when label is 'verified'
  checkedAt?: string; // ISO date, required when label is 'verified'
  note?: string; // shown for 'unverified'
  contradicts?: boolean; // the quote explicitly contradicts this accommodation
}

export type WorkplaceType = "remote" | "hybrid" | "onsite" | "unknown";

// Snapshot sent to the matcher. Never contains disability data or account identifiers.
export interface MatchSnapshot {
  skills: string[];
  roleIds: ChosenRole[];
  requiredAccommodations: AccommodationCode[];
  locationText: string;
  remotePreference: RemotePreference;
  profileVersion: number;
}

export interface CandidateJob {
  jobId: string;
  roleFamily: RoleFamily;
  skills: JobSkill[];
  location: string;
  workplaceType: WorkplaceType;
  accommodations: AccommodationInfo[];
}

export interface MatchRequest {
  requestId: string;
  snapshot: MatchSnapshot;
  jobs: CandidateJob[];
}

export interface MatchFactors {
  skills: { ratio: number; matched: string[]; missing: string[]; limitedInfo: boolean };
  role: { type: "exact" | "adjacent" };
  location: { fit: 0 | 1; reason: string };
  conflicts: { code: AccommodationCode; quote: string }[];
}

export interface AccommodationCoverage {
  requiredStated: AccommodationCode[];
  requiredNotMentioned: AccommodationCode[];
  requiredConflicting: AccommodationCode[];
}

export interface MatchResult {
  jobId: string;
  score: number; // 0 to 100
  factors: MatchFactors;
  accommodationCoverage: AccommodationCoverage;
  explanation: string;
  engine: "uagent" | "fallback";
}

export interface EmailDraft {
  _id: string;
  jobId: string;
  subject: string;
  body: string;
  accommodationCodes: AccommodationCode[];
  disclosed: boolean;
  disclosedConditions: string[];
  generatedBy: "claude" | "template";
  edited: boolean;
  approvedAt?: number;
}

export interface Interview {
  date: string; // ISO date-time
  notes: string;
}

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "PROFILE_INCOMPLETE"
  | "CONSENT_REQUIRED"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "RATE_LIMITED"
  | "EXTRACTION_FAILED"
  | "TTS_UNAVAILABLE"
  | "STT_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL";

export type AppErrorData = {
  code: ErrorCode;
  message: string;
  field?: string;
  retryable: boolean;
};
