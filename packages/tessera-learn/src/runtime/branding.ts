// Two sentinels so the validity check doesn't false-positive when the input
// normalizes to the initial fillStyle.
export function parseColor(
  color: string,
): { r: number; g: number; b: number } | null {
  if (
    typeof CSS !== 'undefined' &&
    CSS.supports &&
    !CSS.supports('color', color)
  ) {
    return null;
  }
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const onBlack = ctx.fillStyle;
  ctx.fillStyle = '#fff';
  ctx.fillStyle = color;
  const onWhite = ctx.fillStyle;
  if (onBlack !== onWhite) return null;
  const hex = String(onBlack).match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i,
  );
  if (hex)
    return {
      r: parseInt(hex[1], 16),
      g: parseInt(hex[2], 16),
      b: parseInt(hex[3], 16),
    };
  const rgba = String(onBlack).match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  );
  return rgba ? { r: +rgba[1], g: +rgba[2], b: +rgba[3] } : null;
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function applyBranding(
  el: HTMLElement,
  branding: { primaryColor?: string; fontFamily?: string } | undefined,
): void {
  if (branding?.primaryColor) {
    el.style.setProperty('--tessera-primary', branding.primaryColor);
    const rgb = parseColor(branding.primaryColor);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      el.style.setProperty(
        '--tessera-primary-light',
        `hsl(${hsl.h}, ${Math.min(hsl.s + 10, 100)}%, 90%)`,
      );
      el.style.setProperty(
        '--tessera-primary-dark',
        `hsl(${hsl.h}, ${Math.min(hsl.s + 10, 100)}%, ${Math.max(hsl.l - 15, 10)}%)`,
      );
      el.style.setProperty(
        '--tessera-focus-ring',
        `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`,
      );
    }
  }
  if (branding?.fontFamily) {
    el.style.setProperty('--tessera-font-family', branding.fontFamily);
  }
}
