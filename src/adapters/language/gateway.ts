import { createHash } from "node:crypto";

/**
 * The LanguageGateway — the ONE place a model is ever called. Every request from
 * the LLM adapter goes through here so that model routing, timeout/retry, the
 * cost ledger, and the audit log live in a single, testable seam.
 *
 * Boundary hygiene (CLAUDE.md → "AI = labor, not judgment"):
 *  - The audit log records the INPUT HASH, never the raw text. Student writing is
 *    untrusted and private; it must not sit in a log.
 *  - The real transport assumes a zero-data-retention API key (an org-level
 *    Anthropic setting — there is no per-request header) AND strips PII before the
 *    text leaves the process, as defense in depth.
 *  - A fake gateway lets the whole system — adapter, eval harness, tests — run
 *    with zero network and zero key. `pnpm check` never touches the API.
 */

export type LanguageTask = "classify" | "tag" | "render";
/**
 * Every task the shared gateway routes a model for. `LanguageTask` stays the
 * narrow set the LanguageCapability adapter + eval harness cover; the reflection-
 * intelligence adapter adds its generative tasks here. The gateway is the ONE
 * place a model is called, so all tasks share its audit/ledger/hash seam.
 */
export type GatewayTask = LanguageTask | "analyze" | "generate";

export interface GatewayRequest {
  task: GatewayTask;
  /** Short instruction; stable per task (kept out of the input hash's variance). */
  system: string;
  /** The already-PII-stripped payload the model reasons over. */
  prompt: string;
  /** Hard ceiling on generated tokens for this task. */
  maxTokens: number;
  /**
   * Optional images (data URLs) attached to the user turn — e.g. photos of the
   * day's board work. Sent to a vision-capable pinned model as image content
   * blocks alongside the text. Ignored by the fake/deterministic paths.
   */
  images?: readonly string[];
  /**
   * Per-request timeout override (ms). Deliberate, non-latency-critical calls
   * (e.g. lesson analysis with photos) can raise it above the gateway default.
   */
  timeoutMs?: number;
}

/** Parse a `data:image/png;base64,…` URL into an Anthropic image source block. */
export function dataUrlToImageBlock(
  dataUrl: string,
): { type: "image"; source: { type: "base64"; media_type: string; data: string } } | null {
  const match = /^data:(image\/[a-zA-Z.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (match === null) return null;
  return {
    type: "image",
    source: { type: "base64", media_type: match[1], data: match[2] },
  };
}

export interface GatewayResponse {
  text: string;
  /** Which pinned model string served the request (drift-checkable). */
  model: string;
}

export interface CostEntry {
  task: GatewayTask;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** USD, computed from the pinned per-task price table. */
  usd: number;
}

export interface AuditEntry {
  at: Date;
  task: GatewayTask;
  model: string;
  /** sha256 of the prompt — enough to correlate, impossible to read back. */
  inputHash: string;
  outcome: "ok" | "error";
  latencyMs: number;
}

export interface Gateway {
  send(request: GatewayRequest): Promise<GatewayResponse>;
  ledger(): readonly CostEntry[];
  audit(): readonly AuditEntry[];
}

export function hashInput(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Per-million-token USD, pinned alongside the model strings for the cost ledger. */
export interface ModelPrice {
  model: string;
  inputPerM: number;
  outputPerM: number;
}

export interface RawResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The low-level, task-agnostic call: given a system+prompt and the pinned model
 * for this task, return text and token counts. Both the HTTP transport and the
 * fake implement this; instrumentation (audit, ledger, hashing) is shared.
 */
export type RawSend = (
  request: GatewayRequest,
  price: ModelPrice,
) => Promise<RawResult>;

export interface GatewayDeps {
  /** Pinned model + price per task. Changing a string trips the drift check. */
  models: Readonly<Record<GatewayTask, ModelPrice>>;
  /** Injected clock — never Date.now(), so audit timestamps are deterministic in tests. */
  now: () => Date;
}

/** Wraps a RawSend with the shared audit log, cost ledger, and input hashing. */
export function instrumentGateway(rawSend: RawSend, deps: GatewayDeps): Gateway {
  const costs: CostEntry[] = [];
  const audits: AuditEntry[] = [];

  return {
    async send(request: GatewayRequest): Promise<GatewayResponse> {
      const price = deps.models[request.task];
      const startedMs = deps.now().getTime();
      const inputHash = hashInput(request.prompt);
      try {
        const raw = await rawSend(request, price);
        const usd =
          (raw.inputTokens / 1_000_000) * price.inputPerM +
          (raw.outputTokens / 1_000_000) * price.outputPerM;
        costs.push({
          task: request.task,
          model: price.model,
          inputTokens: raw.inputTokens,
          outputTokens: raw.outputTokens,
          usd,
        });
        audits.push({
          at: deps.now(),
          task: request.task,
          model: price.model,
          inputHash,
          outcome: "ok",
          latencyMs: deps.now().getTime() - startedMs,
        });
        return { text: raw.text, model: price.model };
      } catch (err) {
        audits.push({
          at: deps.now(),
          task: request.task,
          model: price.model,
          inputHash,
          outcome: "error",
          latencyMs: deps.now().getTime() - startedMs,
        });
        throw err;
      }
    },
    ledger: () => costs,
    audit: () => audits,
  };
}

// --- Fake transport --------------------------------------------------------

/**
 * A deterministic, in-process gateway. The responder is given the request and
 * returns the raw model text; token counts are derived from length. Used by the
 * eval harness and every test so nothing touches the network.
 */
export function createFakeGateway(
  responder: (request: GatewayRequest) => string,
  deps: GatewayDeps,
): Gateway {
  const rawSend: RawSend = async (request) => {
    const text = responder(request);
    return {
      text,
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  };
  return instrumentGateway(rawSend, deps);
}

// --- Anthropic transport ---------------------------------------------------

export interface HttpGatewayConfig extends GatewayDeps {
  apiKey: string;
  /** Defaults to the public Messages API endpoint. */
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_URL = "https://api.anthropic.com/v1/messages";

/**
 * The real transport: one POST to the Anthropic Messages API per call, with
 * per-task pinned models, a request timeout, and bounded retries on transient
 * (429 / 5xx) failures. No SDK dependency — a single fetch keeps the surface
 * minimal and the ZDR assumption explicit.
 */
/**
 * The user-turn content. Plain string when there are no images (unchanged wire
 * shape); an array of a text block plus valid image blocks when photos are
 * attached. Malformed data URLs are dropped rather than sent.
 */
function userContent(
  request: GatewayRequest,
): string | Array<Record<string, unknown>> {
  const images = (request.images ?? [])
    .map(dataUrlToImageBlock)
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (images.length === 0) return request.prompt;
  return [{ type: "text", text: request.prompt }, ...images];
}

export function createHttpGateway(config: HttpGatewayConfig): Gateway {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 8_000;
  const maxRetries = config.maxRetries ?? 2;

  const rawSend: RawSend = async (request, price) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        request.timeoutMs ?? timeoutMs,
      );
      try {
        const res = await fetchImpl(config.baseUrl ?? DEFAULT_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: price.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: userContent(request) }],
          }),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`gateway transient status ${res.status}`);
          continue;
        }
        if (!res.ok) {
          throw new Error(`gateway status ${res.status}`);
        }
        const body = (await res.json()) as {
          content?: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = (body.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
        return {
          text,
          inputTokens: body.usage?.input_tokens ?? 0,
          outputTokens: body.usage?.output_tokens ?? 0,
        };
      } catch (err) {
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("gateway failed after retries");
  };

  return instrumentGateway(rawSend, config);
}
