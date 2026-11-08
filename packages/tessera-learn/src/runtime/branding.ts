export function applyBranding(
  el: HTMLElement,
  branding: { primaryColor?: string; fontFamily?: string } | undefined,
): void {
  // An unparseable inline value would hide a primary color set in course CSS.
  if (branding?.primaryColor && CSS.supports('color', branding.primaryColor)) {
    el.style.setProperty('--tessera-primary', branding.primaryColor);
  }
  if (branding?.fontFamily) {
    el.style.setProperty('--tessera-font-family', branding.fontFamily);
  }
}
