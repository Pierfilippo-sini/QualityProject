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
 * Genera un token di sessione stateless firmato con HMAC-SHA256 (<expiresAtMs>.<hexSignature>.<target>).
 */
export async function createSessionToken(
  secret: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
  target: string = "/"
): Promise<string> {
  const expiresAtMs = Date.now() + maxAgeSeconds * 1000;
  const safeTarget = target.startsWith("/") ? target : `/${target}`;
  const payload = `${TOKEN_PREFIX}:${expiresAtMs}:${safeTarget}`;
  const key = await importHmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return `${expiresAtMs}.${toHex(new Uint8Array(signature))}.${encodeURIComponent(safeTarget)}`;
}

export interface SessionVerificationResult {
  valid: boolean;
  target: string;
}

/**
 * Verifica un token di sessione contro una lista di possibili segreti (es. ACCESS_GATE_SECRET, BRAIN_GATE_SECRET)
 * e restituisce lo stato di validità unitamente al target di destinazione.
 */
export async function verifySessionTokenWithTarget(
  token: string | undefined,
  secrets: (string | undefined)[]
): Promise<SessionVerificationResult> {
  if (!token) {
    return { valid: false, target: "/" };
  }

  const validSecrets = secrets.filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (validSecrets.length === 0) {
    return { valid: false, target: "/" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) {
    return { valid: false, target: "/" };
  }

  const [expiresAtRaw, signatureHex] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return { valid: false, target: "/" };
  }

  const signatureBytes = fromHex(signatureHex);
  if (!signatureBytes) {
    return { valid: false, target: "/" };
  }

  const target = parts.length === 3 ? decodeURIComponent(parts[2] || "/") : "/";
  const payload =
    parts.length === 3
      ? `${TOKEN_PREFIX}:${expiresAtRaw}:${target}`
      : `${TOKEN_PREFIX}:${expiresAtRaw}`;

  const encodedPayload = new TextEncoder().encode(payload);

  for (const secret of validSecrets) {
    try {
      const key = await importHmacKey(secret);
      const isMatch = await globalThis.crypto.subtle.verify(
        "HMAC",
        key,
        signatureBytes,
        encodedPayload
      );
      if (isMatch) {
        return { valid: true, target };
      }
    } catch {
      continue;
    }
  }

  return { valid: false, target: "/" };
}

/**
 * Verifica crittograficamente e temporalmente il cookie `scout_session_token` senza stato lato server.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  if (!secret) {
    return false;
  }
  const result = await verifySessionTokenWithTarget(token, [secret]);
  return result.valid;
}
