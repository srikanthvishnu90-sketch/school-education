/**
 * plumb design tokens — the single source of truth for the design system.
 *
 * These values are mirrored 1:1 into the Tailwind `@theme` block in
 * `src/app/globals.css` so they are consumable as utility classes
 * (e.g. `bg-paper`, `text-ink-black`, `rounded-card`). If you change a value
 * here, change it there too — the two must stay identical.
 *
 * Product-safety note (see CLAUDE.md): accuracy is NEVER encoded as
 * green=good / red=bad. Alignment uses `ink-tint`; gaps use the `warm`
 * accent. Those two roles are the ONLY sanctioned "state" colors.
 */

export const color = {
  // Base
  white: "#FFFFFF",
  paper: "#F6F8FA",

  // Primary (ink family)
  ink: "#1B3A5B",
  inkTint: "#3E6187",
  inkWash: "#E8EEF4",

  // Text
  inkBlack: "#0F1B26",
  secondary: "#536878",

  // Accent — affective / human moments ONLY (<=5% of surface, never text color)
  warm: "#E0A06A",

  // Reflection chat — a focused dark surface derived from the ink family.
  chatBackground: "#080A0D",
  chatSurface: "#12171C",
  chatRaised: "#1B232B",
  chatDivider: "#2B3640",
  chatControl: "#607384",
  chatText: "#F7F9FA",
  chatMuted: "#BBC5CD",
  chatAccent: "#A9C5DE",

  // App shell — the dark K-12 surface (landing, login, courses). DEEP INK NAVY,
  // the same ink DNA as the light surfaces, so dark and light are two modes of
  // ONE identity (not a neutral ChatGPT gray). The accent is PLUMB BRASS — the
  // brass of a plumb bob — for buttons / active states / highlights.
  shellBackground: "#0E1822",
  shellSidebar: "#0A121A",
  shellCard: "#13202B",
  shellPanel: "#21323F",
  shellTrack: "#16232F",
  shellActive: "#2C4150",
  shellBorder: "#294050",
  shellText: "#EAF1F7",
  shellMuted: "#93A7B7",
  /** Primary accent (sage green). Buttons, active states, highlights. Dark text sits on it. */
  shellAccent: "#8FBC9F",

  // Subject color coding — desaturated for a dark bg, used ONLY as small tags or
  // left-borders on cards, never as a full fill.
  subjectMath: "#D97A7A",
  subjectEnglish: "#7A9BD9",
  subjectScience: "#7FC08F",
  subjectHistory: "#A8C8E8",
  subjectSpanish: "#E8D284",
} as const;

/**
 * Accuracy semantics. Deliberately references the ink/warm families above —
 * NOT red/green. `aligned` = confidence matched reality; `gap` = it did not
 * (in either direction: overconfidence OR underconfidence).
 */
export const state = {
  aligned: color.inkTint, // #3E6187
  gap: color.warm, // #E0A06A
} as const;

export const radius = {
  control: "6px",
  card: "12px",
} as const;

export const font = {
  /** All data / academic UI. */
  sans: "Inter, ui-sans-serif, system-ui, sans-serif",
  /**
   * Reflection / emotional ("voice") surfaces. Reserved slot — wired through
   * `--font-voice` but not yet applied anywhere. Serif is intentional here.
   */
  voice: "var(--font-voice)",
} as const;

export type ColorToken = keyof typeof color;
export type StateToken = keyof typeof state;
export type RadiusToken = keyof typeof radius;
export type FontToken = keyof typeof font;

export const tokens = { color, state, radius, font } as const;
