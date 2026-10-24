import { useCallback, useEffect, useRef, useState } from "react";
import { COPY } from "../copy";
import { usePrefs } from "../a11y/prefs";

type Stat = (typeof COPY.home.stats)[number];

const INTERVAL_MS = 6000;
const TRANSITION_MS = 700;

function usePrefersReducedMotion(): boolean {
  const { prefs } = usePrefs();
  const [system, setSystem] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return system || prefs.reduceMotion;
}

// Looping facts carousel for the hero.
//
// Infinite loop: the track renders [clone of last, ...facts, clone of first]. Position 1 is the
// first real card, so both neighbours always exist and their previews show at every step. After
// sliding from the last real card onto the clone of the first (position N + 1), the track jumps
// back to position 1 with transitions off; both show the same card in the same place, so the
// jump is invisible.
//
// Autoplay pauses on hover, while the tab is hidden, and when the user presses Pause. The slides
// hold nothing focusable, so focus never lands inside a moving card; the only control is Pause. With reduced motion (system or app setting) it starts paused and
// steps without sliding.
export function StatsCarousel() {
  const stats = COPY.home.stats;
  const total = stats.length;
  const reduced = usePrefersReducedMotion();
  const [pos, setPos] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [userPaused, setUserPaused] = useState<boolean | null>(null); // null = default for the motion setting
  const [hovering, setHovering] = useState(false);
  const [hidden, setHidden] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const paused = userPaused ?? reduced;
  const running = !paused && !hovering && !hidden;
  const active = (((pos - 1) % total) + total) % total;

  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Seamless wrap: from the clone of the first card back to the real first card, without a transition.
  const wrapIfNeeded = useCallback(() => {
    setPos((p) => {
      if (p !== total + 1) return p;
      setAnimate(false);
      return 1;
    });
  }, [total]);

  // Re-enable transitions after the wrap has been painted.
  useEffect(() => {
    if (animate) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [animate]);

  // Fallback if transitionend never fires (for example, the tab was hidden mid-slide).
  useEffect(() => {
    if (pos !== total + 1) return;
    const t = window.setTimeout(wrapIfNeeded, reduced ? 0 : TRANSITION_MS + 150);
    return () => window.clearTimeout(t);
  }, [pos, total, reduced, wrapIfNeeded]);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      if (reduced) setPos((p) => (p >= total ? 1 : p + 1));
      else {
        setAnimate(true);
        setPos((p) => Math.min(p + 1, total + 1));
      }
    }, INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [running, pos, reduced, total]);

  const slides: { stat: Stat; real: number | null; key: string }[] = [
    { stat: stats[total - 1], real: null, key: "clone-last" },
    ...stats.map((stat, i) => ({ stat, real: i, key: `fact-${i}` })),
    { stat: stats[0], real: null, key: "clone-first" },
  ];

  return (
    <section
      className="stats-carousel"
      aria-roledescription="carousel"
      aria-label={COPY.home.statsLabel}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="stats-viewport">
        <div
          ref={trackRef}
          className="stats-track"
          data-pos={pos}
          data-animate={animate && !reduced ? "true" : "false"}
          style={{ ["--pos" as string]: pos }}
          onTransitionEnd={(e) => {
            if (e.target === trackRef.current && e.propertyName === "transform") wrapIfNeeded();
          }}
        >
          {slides.map(({ stat, real, key }, i) => (
              <article
                key={key}
                className="card stat-card"
                data-active={i === pos ? "true" : "false"}
                // Clones duplicate real cards for the loop; only the four real cards reach assistive tech.
                aria-hidden={real === null ? true : undefined}
                aria-roledescription={real === null ? undefined : "slide"}
                aria-label={real === null ? undefined : COPY.home.statsCount(real + 1, total)}
              >
                <p className="stat-figure">
                  {stat.figure.map((part, k) => (
                    <span key={part} className={k === 0 ? "stat-figure-main" : "stat-figure-sub"}>
                      {part}
                    </span>
                  ))}
                </p>
                <p className="stat-statement">{stat.statement}</p>
                {stat.context && <p className="small muted stat-context">{stat.context}</p>}
                {stat.points.length > 0 && (
                  <ul className="small muted stat-points">
                    {stat.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                )}
                {stat.source && <p className="small muted stat-source">{stat.source}</p>}
              </article>
          ))}
        </div>
      </div>
      <div className="stats-controls">
        {/* Not a live region: autoplay must not announce every change. */}
        <span className="small muted" data-testid="stats-count">
          {COPY.home.statsCount(active + 1, total)}
        </span>
        <button type="button" className="btn-link small" onClick={() => setUserPaused(!paused)}>
          {paused ? COPY.home.statsPlay : COPY.home.statsPause}
        </button>
      </div>
    </section>
  );
}
