"use client";

import type { ReactElement } from "react";
import HeroRotator, { type HeroMedia } from "@/app/_components/HeroRotator";

/**
 * Dev-only demonstration route for HeroRotator, exercising the full media mix:
 * three images and one video (poster + advance-on-ended). Not linked from the
 * marketing site; it exists to verify the component in isolation.
 */
const DEMO_MEDIA: readonly HeroMedia[] = [
  { type: "image", src: "/landing/05-beam.png", alt: "A single line of light resolving to a point", dwellMs: 4000 },
  { type: "image", src: "/landing/01-brain.png", alt: "An abstract rendering of cognition", dwellMs: 4000 },
  { type: "image", src: "/landing/06-topography.png", alt: "A learner on a field of contour lines", dwellMs: 4000 },
  {
    type: "video",
    src: "/landing/hero-loop.webm",
    poster: "/landing/03-beams.png",
    alt: "A slow-moving field of light",
    dwellMs: 6000,
  },
];

export default function HeroDemoPage(): ReactElement {
  return (
    <HeroRotator media={DEMO_MEDIA}>
      <div className="w-full max-w-3xl text-center">
        <p className="mb-5 text-[12px] font-medium uppercase tracking-[0.22em] text-white/60">
          Component demo
        </p>
        <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          HeroRotator — three images and a video
        </h1>
      </div>
    </HeroRotator>
  );
}
