export function applyBranding(
  el: HTMLElement,
  branding: { primaryColor?: string; fontFamily?: string } | undefined,
): void {
  if (branding?.primaryColor) {
    el.style.setProperty('--tessera-primary', branding.primaryColor);
  }
  if (branding?.fontFamily) {
    el.style.setProperty('--tessera-font-family', branding.fontFamily);
  }
}
