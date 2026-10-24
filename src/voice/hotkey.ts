import { useSyncExternalStore } from "react";

// Keyboard shortcut for "Hold to talk". Saved on this device only: keyboards differ between devices.
export interface Combo {
  code: string; // KeyboardEvent.code of the main key, e.g. "Space", "KeyK", "F2"
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}
export type TalkMode = "hold" | "toggle";
export interface VoiceKey {
  combo: Combo;
  mode: TalkMode;
}

export const DEFAULT_VOICE_KEY: VoiceKey = {
  combo: { code: "Space", ctrl: true, alt: false, shift: false, meta: false },
  mode: "hold",
};

const STORAGE_KEY = "bid.voiceKey";
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.test(code);
}

export function comboFromEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): Combo {
  return { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
}

export function matchesCombo(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">, c: Combo): boolean {
  return e.code === c.code && e.ctrlKey === c.ctrl && e.altKey === c.alt && e.shiftKey === c.shift && e.metaKey === c.meta;
}

function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  const named: Record<string, string> = {
    Space: "Space", Enter: "Enter", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Escape: "Esc", Tab: "Tab",
  };
  return named[code] ?? code;
}

export function formatCombo(c: Combo, mac = isMac()): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push(mac ? "Option" : "Alt");
  if (c.shift) parts.push("Shift");
  if (c.meta) parts.push(mac ? "Cmd" : "Win");
  parts.push(keyName(c.code));
  return parts.join("+");
}

// A combo must not fire while typing: it needs Ctrl, Alt/Option or Cmd, unless it is a function key.
export function comboProblem(c: Combo): string | null {
  if (c.code === "Escape" || c.code === "Tab") return `${keyName(c.code)} is used to move around the page. Choose another key.`;
  if (!c.ctrl && !c.alt && !c.meta && !/^F\d{1,2}$/.test(c.code))
    return "Add Ctrl, Alt (Option) or Cmd, so the shortcut does not fire while you type. Function keys (F1 to F12) work on their own.";
  return null;
}

// Common browser and system shortcuts. A match is a warning, not a block: the user may not use that shortcut.
const CONFLICTS: { test: (c: Combo, mac: boolean) => boolean; what: string }[] = [
  { test: (c, mac) => mac && c.ctrl && !c.alt && !c.meta && c.code === "Space", what: "On macOS, Ctrl+Space switches keyboard input source when you have more than one" },
  { test: (c, mac) => mac && c.meta && !c.ctrl && !c.alt && c.code === "Space", what: "Cmd+Space opens Spotlight" },
  { test: (c, mac) => !mac && c.alt && !c.ctrl && !c.meta && c.code === "Space", what: "Alt+Space opens the window menu on Windows" },
  { test: (c, mac) => !mac && c.meta && c.code === "Space", what: "Win+Space switches keyboard layout on Windows" },
  { test: (c, mac) => !c.shift && !c.alt && (mac ? c.meta && !c.ctrl : c.ctrl && !c.meta) && /^Key[ACFLNPRSTVWXZ]$/.test(c.code), what: "The browser already uses this for copy, paste, find, print, new tab, reload or similar" },
  { test: (c, mac) => (mac ? c.meta && !c.ctrl : c.ctrl && !c.meta) && c.shift && /^Key[NTWIJ]$/.test(c.code), what: "The browser already uses this for new or reopened windows and tabs, or developer tools" },
  { test: (c, mac) => (mac ? c.meta : c.ctrl) && /^(Digit\d|Tab|Equal|Minus|Digit0)$/.test(c.code), what: "The browser uses this to switch tabs or zoom" },
  { test: (c) => !c.ctrl && !c.alt && !c.meta && !c.shift && /^F(1|3|5|6|7|11|12)$/.test(c.code), what: "The browser uses this key (help, find, reload, address bar, caret browsing, full screen or developer tools)" },
  { test: (c, mac) => mac && c.ctrl && /^Arrow(Left|Right|Up|Down)$/.test(c.code), what: "macOS uses Ctrl+arrow keys for Spaces and Mission Control" },
  { test: (c, mac) => !mac && c.alt && /^(F4|Tab)$/.test(c.code), what: "Windows uses this to close or switch windows" },
];

export function comboConflict(c: Combo, mac = isMac()): string | null {
  return CONFLICTS.find((x) => x.test(c, mac))?.what ?? null;
}

export function readVoiceKey(): VoiceKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_KEY;
    const v = JSON.parse(raw) as Partial<VoiceKey>;
    const c = v.combo;
    if (!c || typeof c.code !== "string" || comboProblem(c)) return DEFAULT_VOICE_KEY;
    return { combo: { code: c.code, ctrl: !!c.ctrl, alt: !!c.alt, shift: !!c.shift, meta: !!c.meta }, mode: v.mode === "toggle" ? "toggle" : "hold" };
  } catch {
    return DEFAULT_VOICE_KEY;
  }
}

// Small store so the header button and the settings dialog stay in step.
let current: VoiceKey | null = null;
let capturing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getVoiceKey(): VoiceKey {
  current ??= readVoiceKey();
  return current;
}

export function setVoiceKey(next: VoiceKey) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the shortcut still applies for this visit */
  }
  emit();
}

export function useVoiceKey(): VoiceKey {
  return useSyncExternalStore(subscribe, getVoiceKey, getVoiceKey);
}

// While the settings dialog records a new shortcut, the global shortcut is paused.
export function setCapturing(on: boolean) {
  capturing = on;
}
export function isCapturing(): boolean {
  return capturing;
}
