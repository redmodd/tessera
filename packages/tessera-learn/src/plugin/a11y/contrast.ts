/**
 * Pure-JS WCAG contrast helpers. App.svelte's parseColor is canvas-based and
 * browser-only; this runs at build time in the linter (rule 1.7). Only opaque
 * #hex (3/4/6/8) is parsed — other CSS color forms and translucent hex return
 * null and fall through to the Tier-2 axe audit, which uses the browser's own
 * parser.
 */

function parseHex(
  input: string,
): { r: number; g: number; b: number; a: number } | null {
  const v = input.trim();
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(v);
  if (!m) return null;
  const h = m[1];
  let r: number,
    g: number,
    b: number,
    a = 255;
  if (h.length === 3 || h.length === 4) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
    if (h.length === 4) a = parseInt(h[3] + h[3], 16);
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16);
  } else {
    return null; // 5/7 hex digits are not a valid color
  }
  return { r, g, b, a };
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB hex → relative luminance (0–1), or null if not a parseable opaque hex. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  // A translucent color's on-screen luminance depends on the backdrop; defer
  // those to the in-browser Tier-2 audit rather than guess a composite.
  if (rgb.a !== 255) return null;
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

/**
 * WCAG contrast ratio between two colors. Order-independent — the lighter/darker
 * ordering is handled internally, so callers may pass the colors in any order.
 * Returns null if either color isn't a parseable hex.
 */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
