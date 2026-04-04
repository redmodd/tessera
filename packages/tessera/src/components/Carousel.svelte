<script>
  /**
   * @component Carousel
   * Container for CarouselSlide components with arrow navigation and dot indicators.
   *
   * @prop {import('svelte').Snippet} [children] - CarouselSlide children
   */
  import { setContext } from 'svelte';

  let { children } = $props();
  let currentSlide = $state(0);
  let totalSlides = $state(0);
  let touchStartX = 0;
  let touchEndX = 0;

  const ctx = {
    get currentSlide() { return currentSlide; },
    register() {
      const index = totalSlides;
      totalSlides++;
      return index;
    },
  };

  setContext('tessera-carousel', ctx);

  function prev() {
    if (currentSlide > 0) currentSlide--;
  }

  function next() {
    if (currentSlide < totalSlides - 1) currentSlide++;
  }

  function goTo(index) {
    currentSlide = index;
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
  }

  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  }

  // Build dots array reactively
  let dots = $derived(Array.from({ length: totalSlides }, (_, i) => i));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="tessera-carousel"
  role="region"
  aria-roledescription="carousel"
  aria-label="Slide carousel"
  onkeydown={handleKeydown}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  tabindex="0"
>
  <div class="tessera-carousel-viewport">
    <div class="tessera-carousel-track" style="transform: translateX(-{currentSlide * 100}%)">
      {@render children?.()}
    </div>
  </div>

  <div class="tessera-carousel-controls">
    <button
      class="tessera-carousel-arrow tessera-carousel-prev"
      onclick={prev}
      disabled={currentSlide === 0}
      aria-label="Previous slide"
    >
      ‹
    </button>

    <div class="tessera-carousel-dots" role="tablist" aria-label="Slide indicators">
      {#each dots as dot}
        <button
          class="tessera-carousel-dot"
          class:active={dot === currentSlide}
          role="tab"
          aria-selected={dot === currentSlide}
          aria-label="Go to slide {dot + 1}"
          onclick={() => goTo(dot)}
        ></button>
      {/each}
    </div>

    <button
      class="tessera-carousel-arrow tessera-carousel-next"
      onclick={next}
      disabled={currentSlide >= totalSlides - 1}
      aria-label="Next slide"
    >
      ›
    </button>
  </div>
</div>

<style>
  .tessera-carousel {
    margin-bottom: var(--tessera-spacing-lg);
    position: relative;
  }

  .tessera-carousel-viewport {
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--tessera-border);
  }

  .tessera-carousel-track {
    display: flex;
    transition: transform var(--tessera-transition-normal);
  }

  .tessera-carousel-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--tessera-spacing-md);
    margin-top: var(--tessera-spacing-md);
  }

  .tessera-carousel-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--tessera-text);
    background: var(--tessera-bg);
    border: 1px solid var(--tessera-border);
    border-radius: 50%;
    cursor: pointer;
    transition: background-color var(--tessera-transition-fast),
                color var(--tessera-transition-fast);
  }

  .tessera-carousel-arrow:hover:not(:disabled) {
    background-color: var(--tessera-bg-secondary);
  }

  .tessera-carousel-arrow:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tessera-carousel-arrow:focus-visible {
    box-shadow: var(--tessera-focus-ring);
    outline: none;
  }

  .tessera-carousel-dots {
    display: flex;
    gap: 8px;
  }

  .tessera-carousel-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--tessera-border);
    background: var(--tessera-bg);
    cursor: pointer;
    padding: 0;
    transition: background-color var(--tessera-transition-fast);
  }

  .tessera-carousel-dot.active {
    background-color: var(--tessera-primary);
    border-color: var(--tessera-primary);
  }

  .tessera-carousel-dot:focus-visible {
    box-shadow: var(--tessera-focus-ring);
    outline: none;
  }
</style>
