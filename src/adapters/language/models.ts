import type { LanguageTask, ModelPrice } from "./gateway";

/**
 * The PINNED model strings and prices, per task. Pinning is load-bearing: the
 * eval harness's drift check asserts these exact strings, so a model swap fails
 * the build until the golden sets are re-run against the new model. Cheap Haiku
 * does the closed-set classify/tag labor; Sonnet does the one open-ended job
 * (phrasing a question). No model touches the decision path.
 */
export const PINNED_MODELS: Readonly<Record<LanguageTask, ModelPrice>> = {
  classify: { model: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0 },
  tag: { model: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0 },
  render: { model: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0 },
};
