/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` is secure-context-only, so an LMS
 * serving the course over plain http falls back to `getRandomValues` — which
 * is not context-gated and is present wherever `crypto` is.
 */
export function uuidv4(): string {
  const c = globalThis.crypto;
  if (c.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-` +
    `${hex.slice(4, 6).join('')}-` +
    `${hex.slice(6, 8).join('')}-` +
    `${hex.slice(8, 10).join('')}-` +
    `${hex.slice(10, 16).join('')}`
  );
}
