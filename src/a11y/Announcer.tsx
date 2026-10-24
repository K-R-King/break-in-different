import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Announce = (message: string, politeness?: "polite" | "assertive") => void;
const Ctx = createContext<Announce>(() => {});

// App-wide live regions for results, saves and errors.
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const announce = useCallback<Announce>((message, politeness = "polite") => {
    const set = politeness === "assertive" ? setAssertive : setPolite;
    set("");
    window.clearTimeout(timer.current);
    // Clear then set so repeated messages are announced again.
    timer.current = window.setTimeout(() => set(message), 50);
  }, []);
  return (
    <Ctx.Provider value={announce}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-polite">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </Ctx.Provider>
  );
}

export const useAnnounce = () => useContext(Ctx);
