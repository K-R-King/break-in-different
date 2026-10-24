// Voice command grammar (help dialog lists the same commands).
export type VoiceCommand =
  | { type: "navigate"; to: "/jobs" | "/profile" | "/tracker" | "/" }
  | { type: "next" | "previous" | "open" | "read" | "stop" | "save" | "apply" | "scrollDown" | "scrollUp" | "help" };

export const COMMAND_HELP: { say: string; does: string }[] = [
  { say: "go to jobs", does: "Open the Jobs Listing" },
  { say: "go to profile", does: "Open your profile" },
  { say: "go to tracker", does: "Open the Application Tracker" },
  { say: "go home", does: "Open the home page" },
  { say: "next job / previous job", does: "Move between job cards" },
  { say: "open job", does: "Show the selected job's details" },
  { say: "read this", does: "Read the selected job aloud" },
  { say: "stop", does: "Stop reading" },
  { say: "save", does: "Save the selected job" },
  { say: "apply", does: "Request accommodations and apply" },
  { say: "scroll down / scroll up", does: "Scroll the page" },
  { say: "help", does: "Show this list" },
];

export function parseCommand(raw: string): VoiceCommand | null {
  const t = raw.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/\b(go to|show)( the)? (jobs?|job listing|listings?)\b|\bopen( the)? (jobs|job listing|listings)\b/.test(t) || t === "jobs") return { type: "navigate", to: "/jobs" };
  if (/\b(go to|open|show)( my| the)? profile\b/.test(t) || t === "profile") return { type: "navigate", to: "/profile" };
  if (/\b(go to|open|show)( my| the)? (tracker|applications?|application tracker)\b/.test(t) || t === "tracker") return { type: "navigate", to: "/tracker" };
  if (/\b(go home|go to home|home page)\b/.test(t)) return { type: "navigate", to: "/" };
  if (/\bnext( job)?\b/.test(t)) return { type: "next" };
  if (/\b(previous|last|back)( job)?\b/.test(t)) return { type: "previous" };
  if (/\bopen( the)?( job| this)?\b/.test(t)) return { type: "open" };
  if (/\b(read|read this|read it|read aloud)\b/.test(t)) return { type: "read" };
  if (/\b(stop|pause|quiet)\b/.test(t)) return { type: "stop" };
  if (/\bsave\b/.test(t)) return { type: "save" };
  if (/\bapply\b/.test(t)) return { type: "apply" };
  if (/\bscroll down|page down|down\b/.test(t)) return { type: "scrollDown" };
  if (/\bscroll up|page up|up\b/.test(t)) return { type: "scrollUp" };
  if (/\b(help|commands|what can i say)\b/.test(t)) return { type: "help" };
  return null;
}
