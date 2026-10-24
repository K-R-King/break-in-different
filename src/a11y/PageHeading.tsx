import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

// One h1 per page. Focus moves to it on every route change so screen-reader and keyboard
// users start at the top of the new page.
export function PageHeading({ children, className = "page-title", id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [pathname]);
  return (
    <h1 ref={ref} tabIndex={-1} className={className} id={id}>
      {children}
    </h1>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Break In Different` : "Break In Different";
  }, [title]);
}
