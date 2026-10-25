// Voice-only commands: things people say that have no control of their own on screen ("next job",
// "read the description", "go back"). A page registers them while it is shown; they are matched
// like any control, highlighted at `anchor`, and run when said (their name is the command).
import { useEffect, useRef } from "react";

export interface VoiceAction {
  names: string[]; // the first is the label shown in the highlight
  run: () => unknown;
  anchor?: () => HTMLElement | null; // what to highlight; the page itself when absent
  message?: string | (() => string); // the confirmation; defaults to the label
  when?: () => boolean; // available right now
}

const holders = new Set<{ current: VoiceAction[] }>();
let version = 0;

// Changes whenever the set of commands may have changed (the page scan re-reads it).
export function actionsVersion(): number {
  return version;
}

export function currentActions(): VoiceAction[] {
  return [...holders].flatMap((h) => h.current).filter((a) => a.when?.() ?? true);
}

// Registers commands for as long as the calling component is shown. The latest closures are used
// at run time, so handlers may read fresh state.
export function useVoiceActions(actions: VoiceAction[]) {
  const ref = useRef(actions);
  ref.current = actions;
  const key = actions.map((a) => `${a.names.join("|")}:${a.when?.() ?? true}`).join(";");
  useEffect(() => {
    const holder = ref;
    holders.add(holder);
    version++;
    return () => {
      holders.delete(holder);
      version++;
    };
  }, []);
  useEffect(() => {
    version++;
  }, [key]);
}
