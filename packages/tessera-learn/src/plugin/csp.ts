// Baseline Content-Security-Policy for web exports, as a per-directive object so
// course.config.js can extend individual directives (union, never replace).
// 'unsafe-inline' stays because Vite injects an inline modulepreload polyfill and
// Svelte ships scoped <style>. blob: on frame/worker-src needs prior script
// execution, so it adds no attacker capability; data: is intentionally absent
// from frame-src (a classic XSS-escalation vector).
export const WEB_CSP_BASELINE: Record<string, string[]> = {
  'default-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'media-src': ["'self'", 'blob:', 'data:', 'https:'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https:'],
  'frame-src': ["'self'", 'blob:', 'https:'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
};

// Reject the separators (whitespace ends a source, ';' ends a directive, ','
// ends a policy) so a stray char can't inject directives when sources are joined,
// plus " < > so a source can't break out of the content="..." meta attribute.
const CSP_DIRECTIVE = /^[a-zA-Z][a-zA-Z-]*$/;
const CSP_SOURCE = /^[^\s;,"<>]+$/;

export function isCspOverrides(v: unknown): v is Record<string, string[]> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.entries(v).every(
      ([directive, sources]) =>
        CSP_DIRECTIVE.test(directive) &&
        Array.isArray(sources) &&
        sources.every((s) => typeof s === 'string' && CSP_SOURCE.test(s)),
    )
  );
}

// Malformed input falls back to the baseline unchanged — validation surfaces the
// warning separately.
export function buildCsp(overrides?: unknown): string {
  const merged = new Map(
    Object.entries(WEB_CSP_BASELINE).map(([k, v]) => [k, [...v]]),
  );
  if (isCspOverrides(overrides)) {
    for (const [directive, sources] of Object.entries(overrides)) {
      const existing = merged.get(directive) ?? [];
      for (const src of sources) {
        if (!existing.includes(src)) existing.push(src);
      }
      merged.set(directive, existing);
    }
  }
  return [...merged]
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}
