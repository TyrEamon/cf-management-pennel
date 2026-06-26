import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, maskTokenHint } from "../src/crypto/token-crypto";

describe("token crypto", () => {
  it("encrypts and decrypts a Cloudflare API token", async () => {
    const masterKeyBase64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    const token = "cf_test_token_123456";

    const encrypted = await encryptToken(token, masterKeyBase64);
    const decrypted = await decryptToken(encrypted, masterKeyBase64);

    expect(encrypted.ciphertext).not.toContain(token);
    expect(encrypted.hint).toBe("123456");
    expect(maskTokenHint(encrypted.hint)).toBe("****123456");
    expect(decrypted).toBe(token);
  });
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

