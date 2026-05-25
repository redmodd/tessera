/**
 * Shared YouTube/Vimeo embed detection. Used by Video.svelte to pick the iframe
 * vs native-<video> render path, and by the Tier-1b linter (rule 1.4) so its
 * caption/transcript guidance matches what the component actually renders.
 */

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

/** Resolve a source URL to its embed URL, or null if it's not a known embed. */
export function resolveVideoEmbedUrl(src: string): string | null {
  const yt = src.match(YOUTUBE_RE);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const vimeo = src.match(VIMEO_RE);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;
}

/** True when the component will render an iframe embed rather than <video>. */
export function isVideoEmbed(src: string): boolean {
  return resolveVideoEmbedUrl(src) !== null;
}
