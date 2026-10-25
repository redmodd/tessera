<script module>
  import { createContext } from 'svelte';

  /** @type {ReturnType<typeof createContext<{ readonly id: string; readonly currentSlide: number; register(): number }>>} */
  const [getCarouselContext, setCarouselContext] = createContext();
  export { getCarouselContext };
</script>

<script>
  /**
   * @component Carousel
   * Container for CarouselSlide components with arrow navigation and dot indicators.
   *
   * @prop {import('svelte').Snippet} [children] - CarouselSlide children
   */
  let { children } = $props();
  const id = $props.id();
  let currentSlide = $state(0);
  let totalSlides = $state(0);
  let status = $state('');
  let touchStartX = 0;
  let touchEndX = 0;

  const ctx = {
    id,
    get currentSlide() {
      return currentSlide;
    },
    register() {
      const index = totalSlides;
      totalSlides++;
      return index;
    },
  };

  setCarouselContext(ctx);

  function goTo(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;
    currentSlide = index;
    status = `Slide ${index + 1} of ${totalSlides}`;
  }

  const prev = () => goTo(currentSlide - 1);
  const next = () => goTo(currentSlide + 1);

  // Tabs pattern: the dots are one Tab stop, arrows move and select.
  function onDotKeydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const last = totalSlides - 1;
    let index;
    if (e.key === 'ArrowRight')
      index = currentSlide === last ? 0 : currentSlide + 1;
    else if (e.key === 'ArrowLeft')
      index = currentSlide === 0 ? last : currentSlide - 1;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = last;
    else return;
    e.preventDefault();
    goTo(index);
    e.currentTarget.parentElement.children[index].focus();
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

<div
  class="tessera-carousel"
  role="region"
  aria-roledescription="carousel"
  aria-label="Slide carousel"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
>
  <div class="tessera-carousel-viewport">
    <div
      class="tessera-carousel-track"
      style="transform: translateX(-{currentSlide * 100}%)"
    >
      {@render children?.()}
    </div>
  </div>
  <p class="tessera-sr-only" aria-live="polite">{status}</p>

  <div class="tessera-carousel-controls">
    <button
      class="tessera-carousel-arrow tessera-carousel-prev"
      onclick={prev}
      disabled={currentSlide === 0}
      aria-label="Previous slide"
    >
      ‹
    </button>

    <div
      class="tessera-carousel-dots"
      role="tablist"
      aria-label="Slide indicators"
    >
      {#each dots as dot (dot)}
        <button
          class="tessera-carousel-dot"
          class:active={dot === currentSlide}
          role="tab"
          aria-selected={dot === currentSlide}
          aria-controls="{id}-slide-{dot}"
          aria-label="Go to slide {dot + 1}"
          tabindex={dot === currentSlide ? 0 : -1}
          onclick={() => goTo(dot)}
          onkeydown={onDotKeydown}
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
    transition:
      background-color var(--tessera-transition-fast),
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
