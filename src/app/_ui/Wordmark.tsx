import Link from "next/link";
import type { CSSProperties, ReactElement } from "react";

/**
 * The plumb wordmark — the product's name set with intent, not a default sans
 * word. It is lowercase Fraunces (the `font-voice` serif) at a refined,
 * slightly-tight tracking, with a small brass plumb bob suspended by a hairline
 * cord above the terminal "b". The mark echoes the instrument the product is
 * named for: a cord and a brass weight that hang to find TRUE vertical.
 *
 * The word is real, selectable text (so it is legible to assistive tech and
 * search); the bob is purely decorative and `aria-hidden`. Colour is inherited
 * from the surrounding text colour via `className`, so the wordmark sits
 * correctly on either the dark ink-navy shell or the light paper surfaces.
 *
 * `size`   nav (default) / sm for dense chrome / hero for a display lockup.
 * `tone`   picks the bob's green: `dark` = shell sage on navy, `light` = a deeper green on paper.
 * `href`   renders the wordmark as a link (e.g. back to home).
 * `drop`   plays the one-time bob-settle animation (respects reduced-motion).
 * `mark`   set false to render the word alone, with no bob.
 */

type WordmarkSize = "sm" | "nav" | "hero";
type WordmarkTone = "dark" | "light";

const SIZE: Record<WordmarkSize, string> = {
  sm: "text-[15px] leading-none",
  nav: "text-[19px] leading-none",
  hero: "text-[40px] leading-none sm:text-[52px]",
};

export default function Wordmark({
  size = "nav",
  tone = "dark",
  href,
  drop = false,
  mark = true,
  className = "",
}: {
  size?: WordmarkSize;
  tone?: WordmarkTone;
  href?: string;
  drop?: boolean;
  mark?: boolean;
  className?: string;
}): ReactElement {
  const bob =
    tone === "dark"
      ? "var(--color-shell-accent, #8FBC9F)"
      : "#4C8A6B";

  const wordClass = `inline-flex items-baseline font-voice lowercase ${SIZE[size]} ${className}`;
  const wordStyle: CSSProperties = { letterSpacing: "-0.01em", fontWeight: 500 };

  const content = (
    <>
      plum
      {/* The terminal "b" anchors the bob, so it scales and aligns at any size. */}
      <span className="relative inline-block">
        b
        {mark && (
          <span
            aria-hidden
            className={`pointer-events-none absolute flex flex-col items-center ${
              drop ? "plumb-bob-drop" : ""
            }`}
            style={{ left: "0.06em", top: "-0.82em" }}
          >
            {/* cord */}
            <span
              className="block w-px"
              style={{ height: "0.42em", background: bob, opacity: 0.55 }}
            />
            {/* brass bob */}
            <svg
              viewBox="0 0 10 14"
              fill="none"
              className="block"
              style={{ width: "0.34em", height: "0.48em" }}
            >
              <path d="M5 0.5 L9 4 L5 13.5 L1 4 Z" fill={bob} />
            </svg>
          </span>
        )}
      </span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={wordClass} style={wordStyle}>
        {content}
      </Link>
    );
  }
  return (
    <span className={wordClass} style={wordStyle}>
      {content}
    </span>
  );
}
