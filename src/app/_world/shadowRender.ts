import {
  PINNED_MODELS,
  asAsync,
  createDeterministicLanguageCapability,
  createHttpGateway,
  createLlmLanguageCapability,
  type AsyncLanguageCapability,
} from "@/adapters/language";

/**
 * LLM SHADOW MODE (p6). The student is ALWAYS shown the deterministic reflection
 * question. In the background (Next `after()`), the LLM re-renders the same
 * (template, slots) and we log deterministic-vs-LLM so a real golden set can be
 * harvested from the pilot — the only honest way to earn the model onto the
 * surface later (via the P14 regression gate on REAL data).
 *
 * Inputs are TEMPLATE + SLOTS only — teacher exam text and a skill name, never a
 * student's free text — so nothing private is logged. The model runs only when
 * ANTHROPIC_API_KEY is set; otherwise shadow mode is a no-op.
 */

export interface ShadowInput {
  template: string;
  slots: Record<string, string>;
}

export interface ShadowEntry {
  template: string;
  slots: Record<string, string>;
  deterministic: string;
  llm: string;
  /** Whether the (validated) LLM phrasing matched the deterministic one. */
  agreed: boolean;
  at: string;
}

const deterministic = createDeterministicLanguageCapability();

/** The async LLM capability, wired to the real gateway — or null when no key. */
export function buildShadowCapability(): AsyncLanguageCapability | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return null;
  const gateway = createHttpGateway({
    apiKey,
    models: PINNED_MODELS,
    now: () => new Date(),
    timeoutMs: 4000,
  });
  return createLlmLanguageCapability({
    gateway,
    fallback: deterministic,
    // Shadow: render only, and the output is logged, NEVER shown to a student.
    config: { tasks: { classify: false, tag: false, render: true } },
  });
}

/**
 * Compare the LLM render against the deterministic render for each input. Pure
 * over the injected capabilities — testable with a fake-gateway-backed LLM.
 */
export async function shadowCompare(
  llm: AsyncLanguageCapability,
  inputs: readonly ShadowInput[],
  now: () => Date,
): Promise<ShadowEntry[]> {
  const det = asAsync(deterministic);
  const out: ShadowEntry[] = [];
  for (const input of inputs) {
    const [d, l] = await Promise.all([
      det.renderQuestion(input.template, input.slots),
      llm.renderQuestion(input.template, input.slots),
    ]);
    out.push({
      template: input.template,
      slots: input.slots,
      deterministic: d,
      llm: l,
      agreed: d === l,
      at: now().toISOString(),
    });
  }
  return out;
}

// The harvest buffer — pinned to globalThis so it accumulates across bundles.
const store = globalThis as unknown as { __plumbShadowLog?: ShadowEntry[] };
const shadowLog: ShadowEntry[] = (store.__plumbShadowLog ??= []);

export function getShadowLog(): readonly ShadowEntry[] {
  return shadowLog;
}

/** Run shadow rendering (no-op without a key) and append to the harvest log. */
export async function runShadowRenders(
  inputs: readonly ShadowInput[],
): Promise<void> {
  const llm = buildShadowCapability();
  if (llm === null || inputs.length === 0) return;
  try {
    const entries = await shadowCompare(llm, inputs, () => new Date());
    shadowLog.push(...entries);
    const agreed = entries.filter((e) => e.agreed).length;
    console.log(
      `[shadow-render] ${entries.length} rendered, ${agreed} agreed with deterministic`,
    );
  } catch (err) {
    console.log(
      `[shadow-render] skipped: ${err instanceof Error ? err.message : "error"}`,
    );
  }
}
