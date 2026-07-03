"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The scroll-driven opening hero: two thin lines on a near-black canvas — an
 * ink-blue "prediction" path entering from the left and a lighter "evidence"
 * path entering from the right, separated by a wide vertical gap. As the hero
 * scrolls 0→100%, both paths draw themselves in and converge toward a plumb
 * line at center: the moment belief meets reality.
 *
 * Progress is bound to the section's own scroll position (no animation library,
 * no new dependency) and the paths are drawn with an SVG dash offset over a
 * normalized pathLength. prefers-reduced-motion holds the fully-drawn end state.
 */

const CANVAS = "#0A0E13";
const INK = "#1B3A5B"; // prediction
const EVIDENCE = "#7C99B6"; // lighter

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** easeInOutCubic — settles the draw at both ends. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export default function ScrollDrawHero(): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = sectionRef.current;
    if (el === null) return;

    let raf = 0;
    const update = (): void => {
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? clamp(-rect.top / span, 0, 1) : 0;
      setProgress(p);
    };
    const onScroll = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Reduced motion holds the end state; otherwise the draw follows scroll.
  const draw = reduced ? 1 : ease(progress);
  // The two paths converge; the plumb marker and copy arrive late in the scroll.
  const copyIn = reduced ? 1 : clamp((progress - 0.12) / 0.5, 0, 1);
  const markerIn = reduced ? 1 : clamp((progress - 0.72) / 0.22, 0, 1);

  const pathStyle: CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: 1 - draw,
  };

  return (
    <section
      ref={sectionRef}
      className="relative h-[300vh]"
      style={{ backgroundColor: CANVAS }}
      aria-label="How prediction meets evidence"
    >
      <div
        className="sticky top-0 h-screen overflow-hidden"
        style={{ backgroundColor: CANVAS }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1200 675"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {/* Faint plumb line the two paths resolve toward. */}
          <line
            x1={628}
            y1={150}
            x2={628}
            y2={525}
            stroke="#FFFFFF"
            strokeOpacity={0.05 * copyIn}
            strokeWidth={1}
          />

          {/* Prediction — enters from the left edge, upper region. */}
          <path
            d="M -20 206 C 320 206, 520 250, 628 316"
            fill="none"
            stroke={INK}
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            style={pathStyle}
          />
          {/* Evidence — enters from the right edge, lower region. */}
          <path
            d="M 1220 470 C 880 470, 720 404, 628 360"
            fill="none"
            stroke={EVIDENCE}
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            style={pathStyle}
          />

          {/* The convergence marker — the gap between belief and reality, seen. */}
          <circle
            cx={628}
            cy={338}
            r={4 + 2 * markerIn}
            fill={CANVAS}
            stroke="#E0A06A"
            strokeWidth={1.5}
            opacity={markerIn}
          />
        </svg>

        {/* Path labels — quiet, near each entry point. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ opacity: copyIn }}
        >
          <span className="absolute left-[6%] top-[26%] text-[11px] font-medium uppercase tracking-[0.24em] text-[#1B3A5B]">
            Prediction
          </span>
          <span className="absolute right-[6%] top-[66%] text-[11px] font-medium uppercase tracking-[0.24em] text-[#7C99B6]">
            Evidence
          </span>
        </div>

        {/* Headline. */}
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div
            className="max-w-2xl text-center transition-none"
            style={{
              opacity: copyIn,
              transform: `translateY(${(1 - copyIn) * 18}px)`,
            }}
          >
            <p className="mb-5 text-[12px] font-medium uppercase tracking-[0.22em] text-white/55">
              Belief ↔ reality
            </p>
            <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
              Predict first. Then see the truth.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/70 md:text-base">
              plumb draws the line between what you believe about your competence
              and what the evidence shows — and closes the gap between them, in
              either direction.
            </p>
          </div>
        </div>

        {/* Scroll cue, fades out as the draw begins. */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.24em] text-white/40"
          style={{ opacity: clamp(1 - progress * 4, 0, 1) }}
        >
          Scroll
        </div>
      </div>
    </section>
  );
}
