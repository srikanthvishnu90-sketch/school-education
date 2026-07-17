import { describe, expect, it, vi } from "vitest";

import {
  PINNED_MODELS,
  createFakeGateway,
  createHttpGateway,
  hashInput,
  type GatewayDeps,
} from "@/adapters/language";

/**
 * The gateway seam: the audit log records an input HASH (never the raw text), the
 * cost ledger accumulates from token counts, and the HTTP transport speaks the
 * Messages API and retries transient failures — all without a network in tests.
 */

const DEPS: GatewayDeps = {
  models: PINNED_MODELS,
  now: () => new Date("2026-07-01T00:00:00Z"),
};

describe("gateway instrumentation", () => {
  it("audits the input hash, not the raw prompt, and tallies cost", async () => {
    const gw = createFakeGateway(() => "misconception", DEPS);
    const secret = "my name is Avery and I felt dumb";
    const res = await gw.send({
      task: "classify",
      system: "sys",
      prompt: secret,
      maxTokens: 8,
    });

    expect(res.model).toBe("claude-haiku-4-5");
    const [entry] = gw.audit();
    expect(entry.inputHash).toBe(hashInput(secret));
    expect(entry.inputHash).not.toContain("Avery");
    expect(JSON.stringify(gw.audit())).not.toContain("Avery");
    expect(entry.outcome).toBe("ok");

    const [cost] = gw.ledger();
    expect(cost.task).toBe("classify");
    expect(cost.usd).toBeGreaterThan(0);
  });

  it("records an error outcome and rethrows when the transport fails", async () => {
    const gw = createFakeGateway(() => {
      throw new Error("boom");
    }, DEPS);
    await expect(
      gw.send({ task: "tag", system: "s", prompt: "p", maxTokens: 8 }),
    ).rejects.toThrow("boom");
    expect(gw.audit()[0].outcome).toBe("error");
    expect(gw.ledger()).toHaveLength(0);
  });
});

describe("http transport", () => {
  function messagesResponse(text: string): Response {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text }],
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("sends the pinned model with auth headers and parses the reply", async () => {
    let capturedUrl: unknown;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(
      async (
        url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        capturedUrl = url;
        capturedInit = init;
        return messagesResponse("strategy");
      },
    );
    const gw = createHttpGateway({
      ...DEPS,
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await gw.send({
      task: "classify",
      system: "sys",
      prompt: "hello",
      maxTokens: 8,
    });

    expect(res.text).toBe("strategy");
    expect(String(capturedUrl)).toContain("api.anthropic.com");
    const init = capturedInit as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(init.body as string).model).toBe("claude-haiku-4-5");
    // No images → content is a plain string (unchanged wire shape).
    expect(JSON.parse(init.body as string).messages[0].content).toBe("hello");
    expect(gw.ledger()[0].inputTokens).toBe(10);
  });

  it("attaches valid photos as image content blocks, dropping malformed ones", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        capturedInit = init;
        return messagesResponse("ok");
      },
    );
    const gw = createHttpGateway({
      ...DEPS,
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await gw.send({
      task: "analyze",
      system: "sys",
      prompt: "read this",
      maxTokens: 8,
      images: ["data:image/png;base64,AAAABBBB", "not-a-data-url"],
    });

    const content = JSON.parse((capturedInit as RequestInit).body as string)
      .messages[0].content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "read this" });
    // One valid image kept, the malformed one dropped.
    expect(content.filter((b) => b.type === "image")).toHaveLength(1);
    const img = content.find((b) => b.type === "image") as {
      source: { type: string; media_type: string; data: string };
    };
    expect(img.source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: "AAAABBBB",
    });
  });

  it("retries a 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(messagesResponse("external"));
    const gw = createHttpGateway({
      ...DEPS,
      apiKey: "sk-test",
      maxRetries: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await gw.send({
      task: "classify",
      system: "s",
      prompt: "p",
      maxTokens: 8,
    });
    expect(res.text).toBe("external");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
