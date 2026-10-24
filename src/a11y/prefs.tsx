import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DEFAULT_INTERFACE, type InterfacePrefs } from "../../shared/types";

const STORAGE_KEY = "bid.interface";

export function readLocalPrefs(): InterfacePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_INTERFACE, ...JSON.parse(raw) } : DEFAULT_INTERFACE;
  } catch {
    return DEFAULT_INTERFACE;
  }
}

export function applyPrefs(p: InterfacePrefs) {
  const r = document.documentElement;
  r.dataset.font = p.font;
  r.dataset.contrast = p.contrast;
  r.dataset.reduceMotion = String(p.reduceMotion);
  r.style.setProperty("--text-scale", String(p.textScale));
  r.style.setProperty("--line-height", String(p.lineHeight));
  r.style.setProperty("--letter-spacing", `${p.letterSpacing}em`);
  r.style.setProperty("--word-spacing", `${p.wordSpacing}em`);
}

interface PrefsCtx {
  prefs: InterfacePrefs;
  update: (patch: Partial<InterfacePrefs>) => void;
  reset: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

// Preferences apply instantly, persist in local storage for pre-login pages, and sync to the
// profile once signed in so they follow the user across browsers (FR1, A4).
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<InterfacePrefs>(readLocalPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.get, isAuthenticated ? {} : "skip");
  const saveInterface = useMutation(api.profiles.saveInterface);
  const loadedFromServer = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    applyPrefs(prefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: preferences still apply for this visit */
    }
  }, [prefs]);

  // On sign-in: an existing profile's preferences win; otherwise this device's carry over.
  useEffect(() => {
    if (!isAuthenticated) {
      loadedFromServer.current = false;
      return;
    }
    if (profile === undefined || loadedFromServer.current) return;
    loadedFromServer.current = true;
    if (profile) setPrefs({ ...DEFAULT_INTERFACE, ...profile.interface });
    else void saveInterface({ interface: prefs }).catch(() => undefined);
  }, [isAuthenticated, profile, prefs, saveInterface]);

  const persist = useCallback(
    (next: InterfacePrefs) => {
      if (!isAuthenticated) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveInterface({ interface: next }).catch(() => undefined), 400);
    },
    [isAuthenticated, saveInterface],
  );

  const update = useCallback(
    (patch: Partial<InterfacePrefs>) =>
      setPrefs((p) => {
        const next = { ...p, ...patch };
        persist(next);
        return next;
      }),
    [persist],
  );

  const reset = useCallback(() => {
    setPrefs(DEFAULT_INTERFACE);
    persist(DEFAULT_INTERFACE);
  }, [persist]);

  return (
    <Ctx.Provider
      value={{ prefs, update, reset, settingsOpen, openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs outside PrefsProvider");
  return c;
}

// Profile checkboxes for "dyslexia-friendly fonts" and "adjustable spacing" map onto these values.
export const SPACING_PRESET = { lineHeight: 1.8, letterSpacing: 0.05, wordSpacing: 0.1 };
export const SPACING_DEFAULT = { lineHeight: DEFAULT_INTERFACE.lineHeight, letterSpacing: 0, wordSpacing: 0 };
export const spacingOn = (p: InterfacePrefs) => p.lineHeight > 1.5 || p.letterSpacing > 0 || p.wordSpacing > 0;
