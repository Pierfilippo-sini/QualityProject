/**
 * Utility Stateless per Sicurezza e Controllo Accessi (SAD Capitolo 8).
 * Compatibile sia con Edge Runtime (middleware.ts) sia con Node.js Route Handlers
 * sfruttando esclusivamente Web Crypto API (crypto.subtle).
 */

export const SESSION_COOKIE_NAME = "scout_session_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 ore

const TOKEN_PREFIX = "scout_session_v1";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Confronta in tempo costante il PIN inserito con il segreto configurato,
 * evitando timing attack e leak sulla lunghezza tramite digest SHA-256 a 32 byte fissi.
 */
export async function verifyPinConstantTime(
  candidatePin: string,
  expectedSecret: string | undefined
): Promise<boolean> {
  if (!expectedSecret || expectedSecret.length === 0) {
    return false;
  }

  const encoder = new TextEncoder();
  const [candidateDigest, expectedDigest] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(candidatePin)),
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(expectedSecret)),
  ]);

  const a = new Uint8Array(candidateDigest);
  const b = new Uint8Array(expectedDigest);

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

/**
 * Genera un token di sessione stateless firmato con HMAC-SHA256 (<expiresAtMs>.<hexSignature>).
 */
export async function createSessionToken(
  secret: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const expiresAtMs = Date.now() + maxAgeSeconds * 1000;
  const payload = `${TOKEN_PREFIX}:${expiresAtMs}`;
  const key = await importHmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return `${expiresAtMs}.${toHex(new Uint8Array(signature))}`;
}

/**
 * Verifica crittograficamente e temporalmente il cookie `scout_session_token` senza stato lato server.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  if (!token || !secret || secret.length === 0) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [expiresAtRaw, signatureHex] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return false;
  }

  const signatureBytes = fromHex(signatureHex);
  if (!signatureBytes) {
    return false;
  }

  const payload = `${TOKEN_PREFIX}:${expiresAtRaw}`;
  const key = await importHmacKey(secret);

  return globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(payload)
  );
}
