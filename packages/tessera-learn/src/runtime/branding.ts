export function applyBranding(
  el: HTMLElement,
  branding: { primaryColor?: string; fontFamily?: string } | undefined,
): void {
  const primaryColor = branding?.primaryColor;
  if (primaryColor) {
    // An unparseable inline value would hide a primary color set in course CSS.
    if (CSS.supports('color', primaryColor)) {
      el.style.setProperty('--tessera-primary', primaryColor);
    } else {
      console.warn(
        `Tessera: ignoring branding.primaryColor "${primaryColor}", which the browser can't parse as a color`,
      );
    }
  }
  if (branding?.fontFamily) {
    el.style.setProperty('--tessera-font-family', branding.fontFamily);
  }
}
