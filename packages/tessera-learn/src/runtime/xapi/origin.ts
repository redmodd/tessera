/**
 * Origin of an http(s) URL, else null. Shared with the config validator, which
 * predicts this result to know when `actorAccountHomePage` becomes required;
 * one helper keeps the two in lockstep.
 */
export function httpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}
