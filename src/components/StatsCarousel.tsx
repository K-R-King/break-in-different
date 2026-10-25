import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { COPY } from "../copy";
import { usePrefs } from "../a11y/prefs";

type Stat = (typeof COPY.home.stats)[number];

const SPEED_PX_PER_S = 40; // marquee speed
const STEP_MS = 6000; // reduced-motion cross-fade interval
const MIN_RESUME_MS = 400;

function usePrefersReducedMotion(): boolean {
  const { prefs } = usePrefs();
  const [system, setSystem] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return system || prefs.reduceMotion;
}

const isMouse = (e: PointerEvent) => e.pointerType === "mouse";

function FactCard({ stat, label, hidden, hovered }: { stat: Stat; label?: string; hidden: boolean; hovered?: boolean }) {
  return (
    <article
      className="card stat-card"
      aria-hidden={hidden ? true : undefined}
      aria-roledescription={hidden ? undefined : "slide"}
      aria-label={hidden ? undefined : label}
      data-hovered={hovered ? "true" : undefined}
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
  );
}

// Hero facts carousel. No playback controls.
// Normal motion: a continuous marquee. Reduced motion (system or app setting): a cross-fading stepper.
export function StatsCarousel() {
  const reduced = usePrefersReducedMotion();
  return (
    <section className="stats-carousel" aria-roledescription="carousel" aria-label={COPY.home.statsLabel} data-motion={reduced ? "reduced" : "full"}>
      {reduced ? <FadeStepper /> : <Marquee />}
    </section>
  );
}

// Continuous marquee.
//
// The track renders the four facts three times. A CSS keyframe animation moves it left at a
// constant speed by exactly one sequence length per loop, starting with the second copy's first
// card centred. When the animation repeats, every card is back where the identical card was at
// the start, so the loop boundary is invisible. The browser runs the animation; React does not
// update per frame. The duration is set from the measured loop length (on mount and resize) so
// the speed stays at 40 px/s on every screen size.
//
// Hover (mouse only): pointing at a visible card pauses the animation in place
// (animation-play-state) and enlarges that card; leaving resumes from the same position. The
// scale is on the card, not the track, so it never changes the track's transform or loop length.
// Gaps, the faded edges and empty space never pause it. Only the middle copy is exposed to
// assistive tech; the other two copies are aria-hidden.
function Marquee() {
  const stats = COPY.home.stats;
  const total = stats.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const measure = () => {
      const slot = track.querySelector<HTMLElement>(".stat-slot");
      if (!slot) return;
      const loopPx = total * (slot.offsetWidth + parseFloat(getComputedStyle(track).columnGap || "0"));
      if (loopPx > 0) track.style.setProperty("--marquee-duration", `${loopPx / SPEED_PX_PER_S}s`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [total]);

  useEffect(() => {
    const clear = () => setHoveredKey(null);
    window.addEventListener("blur", clear);
    return () => window.removeEventListener("blur", clear);
  }, []);

  // Pause for whichever card is under the pointer, but not in the gaps between cards or in the
  // faded strips at the edges, where a card is barely visible.
  const updateHover = (e: PointerEvent<HTMLDivElement>) => {
    if (!isMouse(e)) return;
    const viewport = viewportRef.current;
    const card = (e.target as Element).closest<HTMLElement>(".stat-card");
    if (!card || !viewport) return setHoveredKey(null);
    const view = viewport.getBoundingClientRect();
    const fade = parseFloat(getComputedStyle(viewport).getPropertyValue("--peek")) * 0.9 || 0;
    const inside = e.clientX >= view.left + fade && e.clientX <= view.right - fade;
    setHoveredKey(inside ? card.parentElement!.dataset.key! : null);
  };

  const copies = [0, 1, 2];
  return (
    <div
      ref={viewportRef}
      className="stats-viewport"
      onPointerMove={updateHover}
      onPointerOver={updateHover}
      onPointerLeave={(e) => isMouse(e) && setHoveredKey(null)}
    >
      <div
        ref={trackRef}
        className="stats-track stats-marquee"
        data-paused={hoveredKey ? "true" : "false"}
        style={{ ["--count" as string]: total }}
      >
        {copies.flatMap((copy) =>
          stats.map((stat, i) => {
            const key = `${copy}-${i}`;
            return (
              <div key={key} className="stat-slot" data-key={key}>
                <FactCard stat={stat} hidden={copy !== 1} label={COPY.home.statsCount(i + 1, total)} hovered={hoveredKey === key} />
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// Reduced-motion alternative: one fact at a time, cross-fading every 6 s, never moving or scaling.
// The track renders [last, ...facts, first] so both neighbours exist as faded previews.
// Hovering the visible active card pauses the countdown (it resumes with the time that was left);
// a hidden tab pauses it too.
function FadeStepper() {
  const stats = COPY.home.stats;
  const total = stats.length;
  const [pos, setPos] = useState(1);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [fadeFrom, setFadeFrom] = useState<{ pos: number; key: number } | null>(null);
  const posRef = useRef(pos);
  const remainingRef = useRef(STEP_MS);
  const running = !(hoveredSlot !== null && hoveredSlot === pos) && !hidden;

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    const onBlur = () => setHoveredSlot(null);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const first = Math.max(MIN_RESUME_MS, remainingRef.current);
    let due = Date.now() + first;
    let id = window.setTimeout(function tick() {
      const p = posRef.current;
      const next = p >= total ? 1 : p + 1;
      posRef.current = next;
      setFadeFrom({ pos: p, key: Date.now() });
      setPos(next);
      due = Date.now() + STEP_MS;
      id = window.setTimeout(tick, STEP_MS);
    }, first);
    return () => {
      window.clearTimeout(id);
      remainingRef.current = Math.max(0, Math.min(STEP_MS, due - Date.now()));
    };
  }, [running, total]);

  const slides: { stat: Stat; real: number | null; key: string }[] = [
    { stat: stats[total - 1], real: null, key: "clone-last" },
    ...stats.map((stat, i) => ({ stat, real: i, key: `fact-${i}` })),
    { stat: stats[0], real: null, key: "clone-first" },
  ];

  const track = (at: number, outgoing: boolean) => (
    <div
      key={outgoing ? `out-${fadeFrom?.key}` : "track"}
      className={outgoing ? "stats-track stats-stepper stats-track-out" : "stats-track stats-stepper"}
      data-pos={outgoing ? undefined : at}
      style={{ ["--pos" as string]: at }}
      aria-hidden={outgoing ? true : undefined}
      inert={outgoing ? true : undefined}
      onAnimationEnd={outgoing ? () => setFadeFrom(null) : undefined}
    >
      {slides.map(({ stat, real, key }, i) => (
        <div
          key={key}
          className="stat-slot"
          data-active={i === at ? "true" : "false"}
          onPointerEnter={outgoing ? undefined : (e) => isMouse(e) && setHoveredSlot(i)}
          onPointerLeave={outgoing ? undefined : (e) => isMouse(e) && setHoveredSlot((h) => (h === i ? null : h))}
        >
          <FactCard stat={stat} hidden={outgoing || real === null} label={real === null ? undefined : COPY.home.statsCount(real + 1, total)} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="stats-viewport">
      {track(pos, false)}
      {fadeFrom && track(fadeFrom.pos, true)}
    </div>
  );
}
