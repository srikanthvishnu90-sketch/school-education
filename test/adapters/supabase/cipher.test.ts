import { describe, expect, it } from "vitest";

import { createDataCipher } from "@/adapters/supabase";

const KEY = "a".repeat(64); // 32 bytes hex

describe("at-rest data cipher (AES-256-GCM)", () => {
  it("round-trips a payload and produces different ciphertext each time (random IV)", () => {
    const cipher = createDataCipher(KEY);
    expect(cipher).not.toBeNull();
    const plaintext = JSON.stringify({ text: "I felt rushed and embarrassed." });
    const a = cipher!.seal(plaintext);
    const b = cipher!.seal(plaintext);
    expect(a).not.toBe(b); // random IV
    expect(a).not.toContain("embarrassed"); // no plaintext leaks
    expect(cipher!.open(a)).toBe(plaintext);
    expect(cipher!.open(b)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const cipher = createDataCipher(KEY)!;
    const sealed = cipher.seal("secret");
    const [iv, tag, data] = sealed.split(".");
    const tampered = `${iv}.${tag}.${Buffer.from("hacked").toString("base64")}`;
    expect(() => cipher.open(tampered)).toThrow();
    void data;
  });

  it("is null (plaintext) when no valid key is configured", () => {
    expect(createDataCipher(undefined)).toBeNull();
    expect(createDataCipher("tooshort")).toBeNull();
  });
});
