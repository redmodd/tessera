<script>
  /**
   * @component Image
   * Lazy-loaded image with optional caption, rendered as <figure>.
   *
   * @prop {string} src - Image source URL (supports $assets/ paths)
   * @prop {string} alt - Alt text. Required unless `decorative` is set; the
   *   linter (rule 1.3) enforces exactly one of {non-empty alt, decorative}.
   * @prop {boolean} [decorative] - Mark a purely ornamental image: renders an
   *   empty alt and aria-hidden so assistive tech skips it.
   * @prop {string} [caption] - Optional caption below image
   */
  import { resolveAsset } from './util.js';

  let { src, alt, decorative = false, caption = '' } = $props();
  let resolvedSrc = $derived(resolveAsset(src));
</script>

<figure class="tessera-image">
  <img
    src={resolvedSrc}
    alt={decorative ? '' : alt}
    aria-hidden={decorative ? 'true' : undefined}
    loading="lazy"
    class="tessera-image-img"
  />
  {#if caption}
    <figcaption class="tessera-image-caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .tessera-image {
    margin: var(--tessera-spacing-lg) 0;
  }

  .tessera-image-img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    display: block;
  }

  .tessera-image-caption {
    margin-top: var(--tessera-spacing-sm);
    font-size: 0.875rem;
    color: var(--tessera-text-light);
    text-align: center;
    font-style: italic;
  }
</style>
