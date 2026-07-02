"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Scroll-reveal wrapper. When the element first enters the viewport it fades
 * and rises into place, then stops observing. This is the Palantir-register
 * "content settles as you scroll" motion, done with a single IntersectionObserver
 * and a CSS transition — no animation library, no per-frame work.
 *
 * Respects prefers-reduced-motion: reduced motion renders fully visible with no
 * transform, so the page is never gated behind an animation.
 */

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms, so a row of cards cascades instead of popping together. */
  delay?: number;
}

export default function Reveal({
  children,
  className,
  delay = 0,
}: RevealProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Reduced motion: no travel, no transition — just present.
  const visible = shown || reduced;
  const style: CSSProperties = reduced
    ? {}
    : {
        transitionDelay: `${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(28px)",
      };

  return (
    <div
      ref={ref}
      style={style}
      className={`${
        reduced
          ? ""
          : "transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform]"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
