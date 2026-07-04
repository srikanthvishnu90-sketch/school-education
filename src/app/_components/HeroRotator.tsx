"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * HeroRotator — a full-bleed hero stage that dwells on each media asset and
 * slow-crossfades to the next, with the content slot pinned throughout. Built to
 * the plumb register: near-black canvas, legibility won in a constant overlay,
 * motion slow and settling. No rotator library — opacity/transform only.
 *
 * Invariants that matter (and are tested):
 *  - At most TWO media layers are ever mounted: the current one, and (only during
 *    a crossfade) the incoming one. The whole array is never mounted.
 *  - A transition never starts until the incoming asset has loaded. If it is not
 *    ready when the dwell ends, the dwell extends — never a fade to a blank frame.
 *  - prefers-reduced-motion holds the first image static with zero timers.
 *  - A hidden tab pauses the rotation and any playing video; visible resumes it.
 */

export type HeroMedia =
  | {
      type: "image";
      src: string;
      /** Served below 768px via <picture>, for a portrait-cropped variant. */
      srcVertical?: string;
      alt: string;
      /** Override the default 7000ms image dwell. */
      dwellMs?: number;
    }
  | {
      type: "video";
      src: string;
      srcVertical?: string;
      alt: string;
      /** First-frame poster; shown until the video paints. */
      poster?: string;
      /** Hard cap; the video also advances on its own 'ended', whichever is first. */
      dwellMs?: number;
    };

export interface HeroRotatorProps {
  media: readonly HeroMedia[];
  /** Centered content (headline/subline/CTA), unaffected by the rotation. */
  children?: ReactNode;
  className?: string;
}

const CROSSFADE_MS = 1500;
const IMAGE_DWELL_MS = 7000;
const VIDEO_DWELL_CAP_MS = 12000;
const NARROW_QUERY = "(max-width: 767px)";

function raf(cb: () => void): number {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : (setTimeout(cb, 0) as unknown as number);
}
function cancelRaf(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
}

function dwellFor(item: HeroMedia): number {
  if (item.dwellMs !== undefined) return item.dwellMs;
  return item.type === "video" ? VIDEO_DWELL_CAP_MS : IMAGE_DWELL_MS;
}

function srcFor(item: HeroMedia, narrow: boolean): string {
  return narrow && item.srcVertical ? item.srcVertical : item.src;
}

export default function HeroRotator({
  media,
  children,
  className,
}: HeroRotatorProps): ReactElement {
  const reduced = useReducedMotion();
  const [narrow, setNarrow] = useState(false);
  const [paused, setPaused] = useState(false);

  const [current, setCurrent] = useState(0);
  const [incoming, setIncoming] = useState<number | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);

  const advancingRef = useRef(false);
  const mountedRef = useRef(true);
  // Cache of in-flight/settled preloads, so an asset loads at most once.
  const preloads = useRef<Map<number, Promise<void>>>(new Map());

  const n = media.length;
  const rotates = n > 1 && !reduced;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Track the narrow breakpoint so preloading fetches the asset that will show.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const apply = (): void => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Pause rotation and video when the tab is hidden.
  useEffect(() => {
    const onVis = (): void => setPaused(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const preload = useCallback(
    (i: number): Promise<void> => {
      const cache = preloads.current;
      const existing = cache.get(i);
      if (existing) return existing;
      const item = media[i];
      const url = srcFor(item, narrow);
      const p = new Promise<void>((resolve) => {
        if (item.type === "image") {
          const img = new window.Image();
          img.onload = (): void => resolve();
          img.onerror = (): void => resolve(); // never block on a bad asset
          img.src = url;
        } else {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.muted = true;
          v.onloadeddata = (): void => resolve();
          v.onerror = (): void => resolve();
          v.src = url;
          v.load();
        }
      });
      cache.set(i, p);
      return p;
    },
    [media, narrow],
  );

  // Begin the crossfade to `next`, but only once the incoming asset is ready.
  const beginTransition = useCallback(
    (next: number): void => {
      if (advancingRef.current || incoming !== null) return;
      advancingRef.current = true;
      void preload(next).then(() => {
        if (!mountedRef.current || document.visibilityState === "hidden") {
          advancingRef.current = false;
          return;
        }
        setIncoming(next);
      });
    },
    [incoming, preload],
  );

  // Dwell driver: schedule the advance for the current asset, and preload the
  // next during the dwell. Re-runs whenever the current asset or pause/motion
  // state changes. Video also advances on 'ended' (wired on the layer).
  useEffect(() => {
    if (!rotates || paused || incoming !== null) return;
    advancingRef.current = false;
    const next = (current + 1) % n;
    preload(next);
    const timer = setTimeout(() => beginTransition(next), dwellFor(media[current]));
    return () => clearTimeout(timer);
  }, [current, rotates, paused, incoming, n, media, preload, beginTransition]);

  // Commit the crossfade: fade the incoming layer in, then promote it to current
  // and unmount the outgoing layer.
  useEffect(() => {
    if (incoming === null) return;
    // incomingVisible is already false here (initial state, and reset on every
    // commit) so the incoming layer mounts at opacity 0; the next frame fades it in.
    const rafId = raf(() => setIncomingVisible(true));
    const done = setTimeout(() => {
      preloads.current.delete(current); // outgoing no longer needed
      setCurrent(incoming);
      setIncoming(null);
      setIncomingVisible(false);
      advancingRef.current = false;
    }, CROSSFADE_MS);
    return () => {
      cancelRaf(rafId);
      clearTimeout(done);
    };
  }, [incoming, current]);

  const onVideoEnded = useCallback((): void => {
    if (!rotates || paused) return;
    beginTransition((current + 1) % n);
  }, [rotates, paused, beginTransition, current, n]);

  return (
    <section
      className={`relative isolate h-[100svh] w-full overflow-hidden bg-[#0A0E13] ${className ?? ""}`}
      aria-label="plumb"
    >
      {/* Media layers — never more than two mounted (current + incoming). */}
      <div className="absolute inset-0" aria-hidden="true">
        <MediaLayer
          key={`cur-${current}`}
          item={media[current]}
          narrow={narrow}
          reduced={reduced}
          paused={paused}
          eager={current === 0}
          active={incoming === null}
          opacity={1}
          onEnded={onVideoEnded}
        />
        {incoming !== null && (
          <MediaLayer
            key={`inc-${incoming}`}
            item={media[incoming]}
            narrow={narrow}
            reduced={reduced}
            paused={paused}
            eager={false}
            active={false}
            opacity={incomingVisible ? 1 : 0}
            onEnded={undefined}
          />
        )}
      </div>

      {/* Constant legibility overlay: same across every scene, so text never
          flickers. transparent → near-black toward the center-bottom. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 78%, rgba(10,14,19,0.65) 0%, rgba(10,14,19,0.28) 45%, rgba(10,14,19,0.10) 100%)",
        }}
      />

      {/* Content slot — pinned center, unaffected by the rotation. */}
      <div className="relative z-10 flex h-full items-center justify-center px-6">
        {children}
      </div>
    </section>
  );
}

function MediaLayer({
  item,
  narrow,
  reduced,
  paused,
  eager,
  active,
  opacity,
  onEnded,
}: {
  item: HeroMedia;
  narrow: boolean;
  reduced: boolean;
  paused: boolean;
  eager: boolean;
  active: boolean;
  opacity: number;
  onEnded?: () => void;
}): ReactElement {
  const [zoom, setZoom] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Ken Burns: start at scale 1, ease to 1.04 once the layer is the active one.
  useEffect(() => {
    if (!active || reduced) return;
    const id = raf(() => setZoom(true));
    return () => cancelRaf(id);
  }, [active, reduced]);

  // Play/pause the video with the layer's active + pause state.
  useEffect(() => {
    const v = videoRef.current;
    if (v === null) return;
    if (active && !paused && !reduced) {
      void v.play().catch(() => {
        /* autoplay guarded; poster stays until dwell cap advances */
      });
    } else {
      v.pause();
    }
  }, [active, paused, reduced]);

  const kenBurns = reduced
    ? undefined
    : {
        transform: zoom ? "scale(1.04)" : "scale(1)",
        transition: `transform ${IMAGE_DWELL_MS + CROSSFADE_MS}ms ease-out`,
      };

  return (
    <div
      data-testid="hero-layer"
      className="absolute inset-0"
      style={{
        opacity,
        transition: reduced ? undefined : `opacity ${CROSSFADE_MS}ms ease-in-out`,
        willChange: "opacity",
      }}
    >
      {item.type === "image" ? (
        <picture>
          {item.srcVertical && (
            <source media={NARROW_QUERY} srcSet={item.srcVertical} />
          )}
          {/* Plain img (not next/image): the manual preload + opacity crossfade
              need direct control over load timing. */}
          <img
            src={item.src}
            alt={active ? item.alt : ""}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="h-full w-full object-cover"
            style={{ ...kenBurns, willChange: "transform" }}
          />
        </picture>
      ) : (
        <video
          ref={videoRef}
          src={srcFor(item, narrow)}
          poster={item.poster}
          muted
          playsInline
          loop={false}
          preload="metadata"
          onEnded={onEnded}
          className="h-full w-full object-cover"
          style={{ ...kenBurns, willChange: "transform" }}
        />
      )}
    </div>
  );
}
