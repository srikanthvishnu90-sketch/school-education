"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The opening slide sequence. Three full-bleed frames slide horizontally, one
 * into the next (brain → converging beams → mind), on a timed auto-advance.
 * Each frame's copy travels with its image, then the active copy settles.
 *
 * The auto-advance pauses when the hero scrolls out of view (nothing animates
 * off-screen) and when the tab is hidden. Manual navigation via the dots resets
 * the timer. prefers-reduced-motion disables both the slide transition and the
 * slow Ken-Burns push, holding on the first frame.
 */

interface Slide {
  img: string;
  eyebrow: string;
  title: string;
  body: string;
}

const SLIDES: readonly Slide[] = [
  {
    img: "/landing/01-brain.png",
    eyebrow: "The calibration instrument",
    title: "Accurate self-knowledge for every learner",
    body: "plumb moves judgment from the institution to the student — closing the gap between what a learner believes about their competence and what is objectively true, in either direction.",
  },
  {
    img: "/landing/03-beams.png",
    eyebrow: "Belief ↔ reality",
    title: "Close the gap on both axes",
    body: "A deterministic engine measures metacognitive calibration and emotional congruence together — surfacing overconfidence and underconfidence alike, grounded in evidence, never a guess.",
  },
  {
    img: "/landing/04-mind.png",
    eyebrow: "Feed-forward",
    title: "An agent that acts on the learning",
    body: "A pure, deterministic policy decides the next move — a fresh transfer probe, a re-decomposition, a differentiated exemplar. Language is labor here; it never sits in the decision.",
  },
] as const;

const ADVANCE_MS = 5600;

export default function HeroCarousel(): ReactElement {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useRef(true);
  const n = SLIDES.length;

  const go = useCallback(
    (to: number): void => {
      setIndex(((to % n) + n) % n);
    },
    [n],
  );

  // Pause the sequence whenever the hero is off-screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (el === null) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Timed auto-advance. `index` is a dependency so manual navigation restarts
  // the dwell on the newly selected frame.
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (inView.current && document.visibilityState === "visible") {
        setIndex((i) => (i + 1) % n);
      }
    }, ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [index, n, reduced]);

  return (
    <section
      ref={sectionRef}
      className="relative h-screen overflow-hidden"
      aria-roledescription="carousel"
      aria-label="How plumb works"
    >
      {/* Sliding track: image + copy travel together. */}
      <div
        className="flex h-full w-full transition-transform duration-[1100ms] ease-[cubic-bezier(0.76,0,0.24,1)] will-change-transform"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transitionDuration: reduced ? "0ms" : undefined,
        }}
      >
        {SLIDES.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.img}
              className="relative h-full w-full flex-[0_0_100%] overflow-hidden"
              aria-hidden={!active}
              role="group"
              aria-roledescription="slide"
            >
              {/* Frame, with a slow push while active. */}
              <div
                className="absolute inset-0 transition-transform duration-[6000ms] ease-out will-change-transform"
                style={{
                  transform:
                    active && !reduced ? "scale(1.08)" : "scale(1.0)",
                }}
              >
                <Image
                  src={s.img}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>

              {/* Legibility overlays. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#050506]/70 via-[#050506]/25 to-[#050506]/85" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_20%,transparent_40%,rgba(5,5,6,0.75)_100%)]" />

              {/* Copy — rises and settles when its frame is active. */}
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <div
                  className="w-full max-w-3xl text-center transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "translateY(0)" : "translateY(26px)",
                  }}
                >
                  <p className="mb-5 text-[12px] font-medium uppercase tracking-[0.22em] text-white/60">
                    {s.eyebrow}
                  </p>
                  <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                    {s.title}
                  </h1>
                  <p className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/75 md:text-base">
                    {s.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Persistent call-to-action, fixed above the sliding frames. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-6">
        <div className="pointer-events-auto flex items-center gap-3">
          <a
            href="#access"
            className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-[#050506] transition hover:bg-white/85"
          >
            Get Started
          </a>
          <a
            href="#platform"
            className="rounded-full border border-white/25 px-6 py-2.5 text-sm font-medium text-white/90 transition hover:border-white/50 hover:bg-white/5"
          >
            See the platform
          </a>
        </div>
      </div>

      {/* Slide rail — the active frame's bar widens and brightens. */}
      <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.img}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show frame ${i + 1}: ${s.eyebrow}`}
            aria-current={i === index}
            className="py-2"
          >
            <span
              className="block h-[3px] rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: i === index ? "40px" : "16px",
                backgroundColor:
                  i === index ? "rgb(255 255 255)" : "rgb(255 255 255 / 0.3)",
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
