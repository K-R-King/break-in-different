import { useEffect, type RefObject } from "react";

// Pages that fit the window: the page itself stops scrolling and its columns scroll on their own
// (styles in base.css under data-layout="fit"). Only when the window is at least minWidth wide and
// the region would still be at least minHeight tall; with large text or small windows the page
// scrolls as usual. region: the element whose top starts the scrolling area, inside <main>.
export function useFitLayout(region: RefObject<HTMLElement | null>, { minWidth, minHeight, enabled = true }: { minWidth: number; minHeight: number; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const check = () => {
      const el = region.current;
      if (!el) return;
      const main = el.closest("main");
      // Everything after <main> (a sticky action bar, the footer) stays on screen too.
      let below = 0;
      for (let s = main?.nextElementSibling; s; s = s.nextElementSibling) below += (s as HTMLElement).offsetHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (window.innerWidth >= minWidth && window.innerHeight - top - below - 16 >= minHeight) root.dataset.layout = "fit";
      else delete root.dataset.layout;
    };
    check();
    const ro = new ResizeObserver(check);
    const main = region.current?.closest("main");
    for (const el of [document.querySelector(".site-header"), region.current?.previousElementSibling, main?.nextElementSibling]) if (el) ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
      delete root.dataset.layout;
    };
  }, [region, minWidth, minHeight, enabled]);
}
