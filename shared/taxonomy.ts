// Shared constants used by the front end, Convex functions and test fixtures.
// The Python agent mirrors ROLE_ADJACENCY in agent/scorer.py; keep them in sync.

export const ACCOMMODATION_CODES = [
  "remote_work",
  "flexible_hours",
  "wheelchair_accessible",
  "written_alternatives",
  "quiet_workspace",
  "assistive_communication_tools",
  "assistive_software",
] as const;
export type AccommodationCode = (typeof ACCOMMODATION_CODES)[number];

export const ACCOMMODATION_LABELS: Record<AccommodationCode, string> = {
  remote_work: "Remote work options",
  flexible_hours: "Flexible working hours",
  wheelchair_accessible: "Wheelchair-accessible workspace",
  written_alternatives: "Written alternatives for phone calls",
  quiet_workspace: "Quiet or low-distraction workspace",
  assistive_communication_tools: "Assistive communication tools",
  assistive_software: "Assistive software",
};

export const ACCOMMODATION_HINTS: Partial<Record<AccommodationCode, string>> = {
  assistive_software:
    "Screen readers, voice control, text-to-speech, dyslexia-friendly fonts, adjustable text and spacing",
};

export const ACCOMMODATION_NEED = ["required", "preferred", "not_needed"] as const;
export type AccommodationNeed = (typeof ACCOMMODATION_NEED)[number];

// Roles the user can choose (F3).
export const CHOSEN_ROLES = ["full_stack_developer", "ml_engineer"] as const;
export type ChosenRole = (typeof CHOSEN_ROLES)[number];

// Every role family a job can be classified into.
export const ROLE_FAMILIES = [
  "full_stack_developer",
  "frontend_engineer",
  "backend_engineer",
  "software_engineer",
  "ml_engineer",
  "applied_scientist",
  "data_scientist",
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const ROLE_LABELS: Record<RoleFamily, string> = {
  full_stack_developer: "Full Stack Developer",
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  software_engineer: "Software Engineer",
  ml_engineer: "ML Engineer",
  applied_scientist: "Applied Scientist",
  data_scientist: "Data Scientist",
};

// Families that count as "adjacent" (R = 0.5) for each chosen role.
export const ROLE_ADJACENCY: Record<ChosenRole, RoleFamily[]> = {
  full_stack_developer: ["frontend_engineer", "backend_engineer", "software_engineer"],
  ml_engineer: ["applied_scientist", "data_scientist"],
};

// Experience levels extracted from listings. Filter only, never part of the score.
export const EXPERIENCE_LEVELS = [
  "internship",
  "new_grad",
  "entry_level",
  "experienced",
  "not_stated",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// Levels offered in the Jobs filter (per the designs). "not_stated" jobs always stay visible.
export const EXPERIENCE_FILTER_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: "internship", label: "Internship" },
  { value: "new_grad", label: "New grad" },
  { value: "entry_level", label: "Entry level (0–2 years)" },
];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  internship: "Internship",
  new_grad: "New grad",
  entry_level: "Entry level",
  experienced: "Experienced",
  not_stated: "Level not stated",
};

export const ACCOMMODATION_EVIDENCE = ["stated", "verified", "unverified", "unavailable"] as const;
export type AccommodationLabel = (typeof ACCOMMODATION_EVIDENCE)[number];

export const APPLICATION_STATUSES = ["saved", "applied", "interviewing", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  rejected: "Rejected",
};

// Optional private selection (sensitiveProfiles). Never sent to matching, agents or extraction.
export const CONDITIONS = [
  "adhd",
  "autism",
  "dyslexia",
  "blindness",
  "low_vision",
  "cerebral_palsy",
  "arthritis",
  "spinal_cord_injury",
  "parkinsons",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  adhd: "ADHD",
  autism: "Autism",
  dyslexia: "Dyslexia",
  blindness: "Blindness",
  low_vision: "Low vision",
  cerebral_palsy: "Cerebral palsy",
  arthritis: "Arthritis",
  spinal_cord_injury: "Spinal cord injury",
  parkinsons: "Parkinson's disease",
};

// One-click suggestions offered after a selection (F15). The user may ignore them.
export const CONDITION_SUGGESTIONS: Record<
  Condition,
  { accommodations: AccommodationCode[]; interface: ("dyslexiaFont" | "spacing" | "tts" | "voice" | "highContrast" | "largeText")[] }
> = {
  adhd: { accommodations: ["quiet_workspace", "flexible_hours"], interface: ["tts"] },
  autism: { accommodations: ["written_alternatives", "quiet_workspace"], interface: [] },
  dyslexia: { accommodations: ["written_alternatives", "assistive_software"], interface: ["dyslexiaFont", "spacing", "tts"] },
  blindness: { accommodations: ["assistive_software"], interface: ["tts", "voice"] },
  low_vision: { accommodations: ["assistive_software"], interface: ["largeText", "highContrast", "tts"] },
  cerebral_palsy: { accommodations: ["wheelchair_accessible", "assistive_software"], interface: ["voice"] },
  arthritis: { accommodations: ["assistive_software", "flexible_hours"], interface: ["voice"] },
  spinal_cord_injury: { accommodations: ["wheelchair_accessible", "remote_work"], interface: ["voice"] },
  parkinsons: { accommodations: ["assistive_software", "flexible_hours"], interface: ["voice", "largeText"] },
};

export const FONT_OPTIONS = ["system", "atkinson", "opendyslexic"] as const;
export type FontOption = (typeof FONT_OPTIONS)[number];

export const LIMITS = {
  maxSkills: 60,
  maxSkillLength: 60,
  resumeMaxBytes: 5 * 1024 * 1024,
  resumeMaxPages: 10,
  ttsMaxChars: 1500,
  agentWaitMs: 8000,
  staleListingHours: 72,
  matchRequestTtlMs: 24 * 60 * 60 * 1000,
  closedListingTtlMs: 30 * 24 * 60 * 60 * 1000,
  aiCallsPerHour: 20,
  resumeUploadsPerDay: 10,
  ttsCallsPerHour: 30,
  sttCallsPerHour: 120,
} as const;
