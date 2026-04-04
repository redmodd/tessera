<script>
  /**
   * @component CarouselSlide
   * Single slide within a Carousel.
   *
   * @prop {import('svelte').Snippet} [children] - Slide content
   */
  import { getContext } from 'svelte';

  let { children } = $props();
  const carousel = getContext('tessera-carousel');
  const index = carousel.register();

  let isCurrent = $derived(carousel.currentSlide === index);
</script>

<div
  class="tessera-carousel-slide"
  role="tabpanel"
  aria-hidden={!isCurrent}
  aria-label="Slide {index + 1}"
>
  {@render children?.()}
</div>

<style>
  .tessera-carousel-slide {
    flex: 0 0 100%;
    min-width: 0;
    padding: var(--tessera-spacing-lg);
  }
</style>
