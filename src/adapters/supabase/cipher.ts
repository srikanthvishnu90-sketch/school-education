import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for the sensitive reflection payloads (a
 * student's chat text and emotional summaries). A separate implementation from
 * the crisis cipher, which is import-isolated to the safety boundary and must not
 * be reached from a persistence adapter.
 *
 * The key comes from REFLECTION_KEY_HEX (64 hex chars = 32 bytes). With no key
 * configured the cipher is null and payloads are stored as plaintext — acceptable
 * for local/dev, NOT for production (a real deployment sets the key or wires a KMS;
 * `openssl rand -hex 32`).
 */

export interface DataCipher {
  seal(plaintext: string): string;
  open(sealed: string): string;
}

export function createDataCipher(
  hex: string | undefined = process.env.REFLECTION_KEY_HEX,
): DataCipher | null {
  if (hex === undefined || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const key = Buffer.from(hex, "hex");
  return {
    seal(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
    },
    open(sealed) {
      const [ivB64, tagB64, dataB64] = sealed.split(".");
      if (ivB64 === undefined || tagB64 === undefined || dataB64 === undefined) {
        throw new Error("malformed sealed payload");
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
