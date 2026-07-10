import type { GatewayTask, ModelPrice } from "./gateway";

/**
 * The PINNED model strings and prices, per task. Pinning is load-bearing: the
 * eval harness's drift check asserts these exact strings, so a model swap fails
 * the build until the golden sets are re-run against the new model. Cheap Haiku
 * does the closed-set classify/tag labor; Sonnet does the open-ended drafting
 * (phrasing a question, analyzing a lesson, generating reflection questions). No
 * model touches the decision path — schema validation + a deterministic fallback
 * contain every output.
 */
export const PINNED_MODELS: Readonly<Record<GatewayTask, ModelPrice>> = {
  classify: { model: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0 },
  tag: { model: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0 },
  render: { model: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0 },
  analyze: { model: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0 },
  generate: { model: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0 },
};
