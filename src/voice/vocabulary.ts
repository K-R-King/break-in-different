// Everyday names for things the app labels formally, so voice users never need the app's own
// wording. Used as data-voice-names="a|b|c" on the elements (see src/voice/intent/scan.ts).
import type { AccommodationCode, RoleFamily } from "../../shared/taxonomy";

export const ACCOMMODATION_VOICE: Record<AccommodationCode, string[]> = {
  // "work from home", "WFH" and "remotely" already mean "remote" (match.ts synonyms); listing them
  // would claim plain "remote" from the Remote option.
  remote_work: ["remote work", "remote work options", "work remotely"],
  flexible_hours: ["flexible hours", "flexible schedule", "flex time", "flexible time"],
  wheelchair_accessible: ["wheelchair access", "wheelchair accessible", "accessible office", "step-free access"],
  written_alternatives: ["no phone calls", "written instead of calls", "email instead of calls", "text instead of calls"],
  quiet_workspace: ["quiet space", "quiet workspace", "low distraction", "quiet office"],
  assistive_communication_tools: ["communication tools", "AAC", "communication aids"],
  assistive_software: ["assistive tech", "assistive technology", "screen reader software"],
};

export const ROLE_VOICE: Partial<Record<RoleFamily, string[]>> = {
  full_stack_developer: ["full stack", "fullstack", "web developer"],
  ml_engineer: ["machine learning", "ML", "AI engineer"],
};

// Joins names for data-voice-names, skipping empty ones.
export function voiceNames(...names: (string | string[] | false | null | undefined)[]): string {
  return names
    .flat()
    .filter((n): n is string => !!n && !!n.trim())
    .join("|");
}
