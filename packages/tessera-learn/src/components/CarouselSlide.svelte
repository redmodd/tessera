<script>
  /**
   * @component CarouselSlide
   * Single slide within a Carousel.
   *
   * @prop {import('svelte').Snippet} [children] - Slide content
   */
  import { getCarouselContext } from './Carousel.svelte';

  let { children } = $props();
  const carousel = getCarouselContext();
  const index = carousel.register();
</script>

<div
  class="tessera-carousel-slide"
  id={carousel.slideId(index)}
  role="tabpanel"
  inert={carousel.currentSlide !== index}
  aria-labelledby={carousel.tabId(index)}
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
