import { describe, expect, it } from "vitest";

import { withLock } from "@/app/_world/keyedMutex";

/**
 * The per-key mutex must serialize same-key work (so a session's read-modify-write
 * never interleaves) while letting different keys run concurrently.
 */
describe("keyed mutex", () => {
  it("serializes same-key critical sections (no interleaving)", async () => {
    const log: string[] = [];
    // Shared counter with an await inside — the classic lost-update shape.
    let value = 0;
    const bump = () =>
      withLock("s", async () => {
        const read = value;
        await new Promise((r) => setTimeout(r, 5));
        value = read + 1;
        log.push(`done:${value}`);
      });

    await Promise.all([bump(), bump(), bump(), bump(), bump()]);
    expect(value).toBe(5); // every increment landed — none clobbered
    expect(log).toEqual(["done:1", "done:2", "done:3", "done:4", "done:5"]);
  });

  it("runs different keys concurrently", async () => {
    const order: string[] = [];
    await Promise.all([
      withLock("a", async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("a");
      }),
      withLock("b", async () => {
        order.push("b"); // b has no delay → finishes first despite starting together
      }),
    ]);
    expect(order).toEqual(["b", "a"]);
  });

  it("a rejecting critical section doesn't wedge the next one", async () => {
    await expect(
      withLock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // The next holder still runs.
    await expect(withLock("k", async () => "ok")).resolves.toBe("ok");
  });
});
