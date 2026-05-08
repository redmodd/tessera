<script>
  /**
   * @component Image
   * Lazy-loaded image with optional caption, rendered as <figure>.
   *
   * @prop {string} src - Image source URL (supports $assets/ paths)
   * @prop {string} alt - Alt text (required for accessibility)
   * @prop {string} [caption] - Optional caption below image
   */
  let { src, alt, caption = '' } = $props();

  // Resolve $assets/ prefix to the assets directory.
  // In dev, Vite serves from project root so /assets/ works.
  // In build, the Vite alias handles JS imports but not HTML attrs,
  // so we rewrite to a root-relative path that Vite can serve.
  let resolvedSrc = $derived(
    src.startsWith('$assets/') ? src.replace('$assets/', '/assets/') : src
  );
</script>

<figure class="tessera-image">
  <img src={resolvedSrc} {alt} loading="lazy" class="tessera-image-img" />
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
