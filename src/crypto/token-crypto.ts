import type { EncryptedToken } from "../types";

const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
type AesKeyUsage = "encrypt" | "decrypt";

export async function encryptToken(
  token: string,
  masterKeyBase64: string,
): Promise<EncryptedToken> {
  const key = await importAesKey(masterKeyBase64, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(token);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  const ciphertext = encrypted.slice(0, encrypted.length - AUTH_TAG_BYTES);
  const authTag = encrypted.slice(encrypted.length - AUTH_TAG_BYTES);

  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
    hint: token.slice(-6),
  };
}

export async function decryptToken(
  encrypted: Pick<EncryptedToken, "ciphertext" | "iv" | "authTag">,
  masterKeyBase64: string,
): Promise<string> {
  const key = await importAesKey(masterKeyBase64, ["decrypt"]);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const authTag = base64ToBytes(encrypted.authTag);
  const iv = base64ToBytes(encrypted.iv);
  const combined = concatBytes(ciphertext, authTag);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    combined,
  );

  return new TextDecoder().decode(plaintext);
}

export function maskTokenHint(hint: string | null): string | null {
  return hint ? `****${hint}` : null;
}

async function importAesKey(
  masterKeyBase64: string,
  usages: AesKeyUsage[],
): Promise<CryptoKey> {
  const rawKey = base64ToBytes(masterKeyBase64);
  if (rawKey.byteLength !== 32) {
    throw new Error("APP_MASTER_KEY_BASE64 must decode to 32 bytes");
  }

  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, usages);
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
