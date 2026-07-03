import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CrisisCipher } from "./ports";

/**
 * AES-256-GCM cipher for the triggering text. The escalation stores `textRef` as
 * ciphertext, never plaintext; access to the row is further restricted by RLS to
 * the counselor role. The key is injected (from the environment / a KMS in
 * production) — never hard-coded here.
 */
export function createAesCipher(key: Buffer): CrisisCipher {
  if (key.length !== 32) {
    throw new Error("crisis cipher requires a 32-byte (256-bit) key");
  }
  return {
    seal(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
    },
    open(sealed: string): string {
      const [ivB64, tagB64, dataB64] = sealed.split(".");
      if (ivB64 === undefined || tagB64 === undefined || dataB64 === undefined) {
        throw new Error("malformed sealed text");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivB64, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/** Derive the cipher key from a hex-encoded 32-byte secret (env/KMS in production). */
export function cipherKeyFromHex(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("crisis cipher key must be 64 hex chars (32 bytes)");
  }
  return key;
}
