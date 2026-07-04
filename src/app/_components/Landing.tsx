"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactElement } from "react";
import GetStarted from "./GetStarted";
import HeroRotator, { type HeroMedia } from "./HeroRotator";
import Reveal from "./Reveal";
import ScrollDrawHero from "./ScrollDrawHero";

/**
 * The hero media sequence — the two new field renders (a single line resolving to
 * a point of truth; a learner located on their own contour) and a slow motion clip,
 * interleaved with the existing frames under one pinned headline. Each still holds
 * for 3s; the clip plays through. The first asset is an eager image for the LCP.
 */
const STILL_DWELL_MS = 3000;
// Curated to dark-centered frames so the white headline holds over every scene
// (the bright centered brain render is deliberately left out — it washed the
// text). All ambient; the constant overlay carries legibility.
const HERO_MEDIA: readonly HeroMedia[] = [
  { type: "image", src: "/landing/05-beam.png", alt: "A single line of light resolving to a point", dwellMs: STILL_DWELL_MS },
  { type: "video", src: "/landing/hero-loop.mp4", poster: "/landing/05-beam.png", alt: "A slow-moving field of light" },
  { type: "image", src: "/landing/06-topography.png", alt: "A learner located on a field of contour lines", dwellMs: STILL_DWELL_MS },
  { type: "image", src: "/landing/03-beams.png", alt: "Converging beams of light", dwellMs: STILL_DWELL_MS },
  { type: "image", src: "/landing/04-mind.png", alt: "An abstract rendering of a settled mind", dwellMs: STILL_DWELL_MS },
];

/**
 * The plumb marketing landing page — a Palantir-register, dark, full-bleed site.
 * The opening is a full-bleed media rotator (HeroRotator) that slow-crossfades
 * field renders under a pinned headline; everything below settles into place on
 * scroll (Reveal). The content maps 1:1 to what is actually built: evidence
 * ingestion, the calibration engine, the two-axis gap, and the intervention agent.
 */

const CAPABILITIES: readonly { k: string; t: string; b: string }[] = [
  {
    k: "01",
    t: "Evidence ingestion",
    b: "Messy external gradebooks are pulled behind an EvidenceSource port, normalized at a validated boundary, and quarantined row-by-row — the pipeline never crashes on a bad record.",
  },
  {
    k: "02",
    t: "Calibration engine",
    b: "Brier, bias, and resolution computed over the items a learner both predicted and was scored on. Pure functions, referentially transparent — a missing measurement is never a zero.",
  },
  {
    k: "03",
    t: "Two-axis gap",
    b: "The academic gap (confidence vs. correctness) and the emotional gap (goal-referenced affect congruence) are measured on one instrument, so a learner who feels good about a 50 is seen.",
  },
  {
    k: "04",
    t: "Intervention agent",
    b: "An observation assembles from real evidence; a pure priority policy decides one intervention and acts through services. Deterministic, testable, zero-LLM in the decision path.",
  },
];

const PRINCIPLES: readonly { t: string; b: string }[] = [
  {
    t: "Task-focused, never self-focused",
    b: "Feedback talks about the work, not the worth. Over a third of feedback interventions reduce performance when they turn attention to the self; plumb refuses that failure mode by design.",
  },
  {
    t: "AI is labor, not judgment",
    b: "The language capability may normalize evidence and tag skills. It may never compute a gap, decide an intervention, or set a safety outcome. The deterministic default works with zero model calls.",
  },
  {
    t: "Trajectory over any single judgment",
    b: "Adolescent metacognition is emerging and its accuracy is highly variable. plumb externalizes the monitoring and trusts the trend — never one self-report in isolation.",
  },
];

export default function Landing(): ReactElement {
  const [scrolled, setScrolled] = useState(false);
  const [announce, setAnnounce] = useState(true);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050506] text-white antialiased">
      {/* Dark backdrop so rubber-band overscroll never flashes the light body */}
      <div className="fixed inset-0 -z-10 bg-[#050506]" aria-hidden />

      {/* Top navigation, with a dismissible announcement strip above it */}
      <header className="fixed inset-x-0 top-0 z-50">
        {announce && (
          <div className="border-b border-white/10 bg-[#050506]/85 backdrop-blur-md">
            <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-4 px-6 text-[13px]">
              <p className="truncate text-white/75">
                <span className="text-white/45">New</span>{" "}
                Read how plumb closes the calibration gap —{" "}
                <a href="#principles" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  the principles
                </a>
              </p>
              <button
                type="button"
                onClick={() => setAnnounce(false)}
                aria-label="Dismiss announcement"
                className="shrink-0 text-white/45 transition hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div
          className={`transition-colors duration-300 ${
            scrolled
              ? "border-b border-white/10 bg-[#050506]/80 backdrop-blur-md"
              : "border-b border-transparent"
          }`}
        >
          <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <a href="#top" className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-white text-[13px] font-semibold text-[#050506]">
                p
              </span>
              <span className="text-[15px] font-medium tracking-tight">plumb</span>
            </a>
            <div className="hidden items-center gap-8 text-[13px] text-white/70 md:flex">
              <a className="transition hover:text-white" href="#platform">
                Platform
              </a>
              <a className="transition hover:text-white" href="#principles">
                Principles
              </a>
              <Link className="transition hover:text-white" href="/signin">
                Try the cycle
              </Link>
            </div>
            <Link
              href="/signin"
              className="rounded-md bg-white px-5 py-2 text-[13px] font-medium text-[#050506] transition hover:bg-white/85"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Scroll-driven opening: prediction and evidence lines converge */}
        <ScrollDrawHero />

        {/* Full-bleed hero: crossfading field renders, headline pinned center */}
        <HeroRotator media={HERO_MEDIA}>
          <div className="w-full max-w-4xl text-center">
            <p className="mb-6 text-[12px] font-medium uppercase tracking-[0.22em] text-white/60">
              The calibration instrument
            </p>
            <h1 className="text-balance text-4xl font-medium leading-[1.03] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Accurate self-knowledge
              <br className="hidden sm:block" /> for every learner
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-pretty text-[15px] leading-relaxed text-white/75 md:text-base">
              plumb moves judgment from the institution to the learner — closing
              the gap between what a student believes about their competence and
              what is objectively true, in either direction.
            </p>
            <div className="mt-9 flex items-center justify-center gap-3">
              <Link
                href="/signin"
                className="rounded-md bg-white px-7 py-3 text-[15px] font-medium text-[#050506] transition hover:bg-white/85"
              >
                Get Started
              </Link>
              <a
                href="#platform"
                className="rounded-md border border-white/25 px-7 py-3 text-[15px] font-medium text-white/90 transition hover:border-white/50 hover:bg-white/5"
              >
                See the platform
              </a>
            </div>
          </div>
        </HeroRotator>

        {/* Platform capabilities */}
        <section
          id="platform"
          className="relative scroll-mt-16 border-y border-[#1B3A5B]/15 bg-white text-[#0F1B26]"
        >
          <div className="mx-auto max-w-7xl px-6 py-28">
            <Reveal>
              <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-[#1B3A5B]">
                The platform
              </p>
              <h2 className="mt-5 max-w-3xl text-3xl font-medium leading-tight tracking-tight text-[#0F1B26] sm:text-4xl">
                One instrument, from raw evidence to the next action.
              </h2>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[#536878]">
                plumb is built on strict ports-and-adapters foundations — the
                business logic runs without a browser, a database, or a network
                call. Every capability below is real and under test.
              </p>
            </Reveal>

            <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-[#1B3A5B]/15 bg-[#1B3A5B]/10 sm:grid-cols-2">
              {CAPABILITIES.map((c, i) => (
                <Reveal key={c.k} delay={(i % 2) * 90}>
                  <div className="group h-full bg-white p-8 transition-colors hover:bg-[#F6F8FA]">
                    <span className="block h-px w-8 bg-[#1B3A5B]/40" />
                    <div className="mt-6 flex items-baseline gap-4">
                      <span className="text-[13px] font-semibold tabular-nums text-[#1B3A5B]">
                        {c.k}
                      </span>
                      <h3 className="text-lg font-medium tracking-tight text-[#0F1B26]">
                        {c.t}
                      </h3>
                    </div>
                    <p className="mt-4 text-[15px] leading-relaxed text-[#536878]">
                      {c.b}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section
          id="principles"
          className="relative scroll-mt-16 overflow-hidden border-t border-white/10"
        >
          <Image
            src="/landing/03-beams.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-[#050506]/80" />
          <div className="relative mx-auto max-w-7xl px-6 py-28">
            <Reveal>
              <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-white/50">
                Principles
              </p>
              <h2 className="mt-5 max-w-3xl text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
                Built under constraints, not decoration.
              </h2>
            </Reveal>
            <div className="mt-16 grid gap-12 md:grid-cols-3">
              {PRINCIPLES.map((p, i) => (
                <Reveal key={p.t} delay={i * 110}>
                  <div className="h-px w-12 bg-[#E0A06A]" />
                  <h3 className="mt-6 text-lg font-medium tracking-tight">
                    {p.t}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-white/65">
                    {p.b}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Get Started */}
        <GetStarted />

        {/* Footer */}
        <footer className="border-t border-white/10 bg-[#050506]">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-white text-[13px] font-semibold text-[#050506]">
                p
              </span>
              <span className="text-[15px] font-medium tracking-tight">
                plumb
              </span>
            </div>
            <p className="text-[13px] text-white/45">
              A personal instrument for accurate academic self-knowledge.
            </p>
            <p className="text-[13px] text-white/45">
              © 2026 plumb. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
