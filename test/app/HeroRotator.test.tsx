import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HeroRotator, { type HeroMedia } from "@/app/_components/HeroRotator";

/**
 * The rotator's invariants are structural, so they are asserted against the DOM:
 * at most two media layers ever mount, a transition is blocked until the incoming
 * asset loads, reduced motion holds the first frame with no timers, and a hidden
 * tab pauses the rotation and any video.
 */

// A controllable Image stand-in: `auto` fires onload on the next microtask; when
// off, load is fired manually to simulate a slow asset.
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  static instances: MockImage[] = [];
  static auto = true;
  set src(v: string) {
    this._src = v;
    MockImage.instances.push(this);
    if (MockImage.auto) queueMicrotask(() => this.onload?.());
  }
  get src(): string {
    return this._src;
  }
}

function setMatchMedia(opts: { reduce?: boolean; narrow?: boolean } = {}): void {
  const { reduce = false, narrow = false } = opts;
  window.matchMedia = ((q: string) => {
    const matches = q.includes("reduce")
      ? reduce
      : q.includes("max-width")
        ? narrow
        : false;
    return {
      matches,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

const IMAGES: HeroMedia[] = [
  { type: "image", src: "/a.png", alt: "first" },
  { type: "image", src: "/b.png", alt: "second" },
  { type: "image", src: "/c.png", alt: "third" },
];

const layers = (): HTMLElement[] => screen.queryAllByTestId("hero-layer");

beforeEach(() => {
  vi.useFakeTimers();
  MockImage.instances = [];
  MockImage.auto = true;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.Image = MockImage as unknown as typeof window.Image;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  setMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeroRotator", () => {
  it("mounts one layer at rest, two during a crossfade, and never the whole array", async () => {
    render(<HeroRotator media={IMAGES} />);
    expect(layers()).toHaveLength(1);
    expect(screen.getByAltText("first")).toBeInTheDocument();

    // Dwell elapses → incoming (already preloaded) fades in: two layers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(layers()).toHaveLength(2);

    // Crossfade completes → outgoing unmounts, back to one layer on the next.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(layers()).toHaveLength(1);
    expect(screen.getByAltText("second")).toBeInTheDocument();

    // Full loop: it never exceeds two layers at any sampled moment.
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(layers().length).toBeLessThanOrEqual(2);
    }
  });

  it("blocks the transition until the incoming asset has loaded (no blank frame)", async () => {
    MockImage.auto = false; // assets do not resolve on their own
    render(<HeroRotator media={IMAGES} />);
    // Let the first-frame preload be created, then dwell out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    // The incoming asset is still loading → no second layer yet (dwell extends).
    expect(layers()).toHaveLength(1);

    // The incoming preload is the most recent Image instance; fire its load.
    await act(async () => {
      MockImage.instances.at(-1)?.onload?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(layers()).toHaveLength(2);
  });

  it("holds the first image static with zero rotation timers under reduced motion", async () => {
    setMatchMedia({ reduce: true });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    render(<HeroRotator media={IMAGES} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // Never advances, never mounts a second layer.
    expect(layers()).toHaveLength(1);
    expect(screen.getByAltText("first")).toBeInTheDocument();
    // No dwell-length timer was ever scheduled.
    const scheduledDwell = setTimeoutSpy.mock.calls.some(
      ([, delay]) => typeof delay === "number" && delay >= 1000,
    );
    expect(scheduledDwell).toBe(false);
  });

  it("pauses rotation and the video when the tab is hidden", async () => {
    const withVideo: HeroMedia[] = [
      { type: "video", src: "/v.webm", alt: "clip", dwellMs: 8000 },
      { type: "image", src: "/b.png", alt: "second" },
    ];
    render(<HeroRotator media={withVideo} />);

    // Hide the tab and fire visibilitychange.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    // The current video was paused.
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    // Past the dwell, still no advance while hidden: one layer, still the video.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(layers()).toHaveLength(1);
    expect(layers()[0].querySelector("video")).not.toBeNull();
    expect(screen.queryByAltText("second")).toBeNull();
  });
});
