// Voice assistant settings, saved on this device.
//   speak     replies are spoken (Cartesia), not only shown and announced to screen readers
//   guidance  how much the assistant says: brief (confirmations), suggest (plus a next step),
//             full (also where you are and what you can do: for people who cannot see the page)
//   agent     developer setting: off means keyword matching only (no AI inference, highlights and
//             actions come from keywords alone)
import { useSyncExternalStore } from "react";

export type Guidance = "brief" | "suggest" | "full";
export interface VoiceSettings {
  speak: boolean;
  guidance: Guidance;
  agent: boolean;
}

const KEY = "bid.voiceSettings";
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { speak: true, guidance: "suggest", agent: true };

function read(): VoiceSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoiceSettings>;
    return {
      speak: typeof v.speak === "boolean" ? v.speak : DEFAULT_VOICE_SETTINGS.speak,
      guidance: v.guidance === "brief" || v.guidance === "full" ? v.guidance : DEFAULT_VOICE_SETTINGS.guidance,
      agent: typeof v.agent === "boolean" ? v.agent : DEFAULT_VOICE_SETTINGS.agent,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

let current: VoiceSettings | null = null;
const subs = new Set<() => void>();

export function getVoiceSettings(): VoiceSettings {
  current ??= read();
  return current;
}

export function setVoiceSettings(patch: Partial<VoiceSettings>) {
  current = { ...getVoiceSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: applies for this visit */
  }
  subs.forEach((f) => f());
}

export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    getVoiceSettings,
    getVoiceSettings,
  );
}
