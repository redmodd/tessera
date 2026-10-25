<script module>
  import { createContext } from 'svelte';

  /** @type {ReturnType<typeof createContext<{ readonly currentSlide: number; register(): number; slideId(index: number): string; tabId(index: number): string }>>} */
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
  import { rovingIndex } from './util.js';

  let { children } = $props();
  const id = $props.id();
  let currentSlide = $state(0);
  let totalSlides = $state(0);
  let status = $state('');
  let touchStartX = 0;
  let viewport;

  const ctx = {
    get currentSlide() {
      return currentSlide;
    },
    register() {
      const index = totalSlides;
      totalSlides++;
      return index;
    },
    slideId: (index) => `${id}-slide-${index}`,
    tabId: (index) => `${id}-tab-${index}`,
  };

  setCarouselContext(ctx);

  const focusDot = (index) => document.getElementById(ctx.tabId(index)).focus();

  function goTo(index, announce = false) {
    // An inert slide drops focus to the page, where arrow keys change pages.
    const moveFocus = viewport.contains(document.activeElement);
    if (moveFocus) focusDot(index);
    currentSlide = index;
    // A focused dot already announces the selected slide.
    status =
      announce && !moveFocus ? `Slide ${index + 1} of ${totalSlides}` : '';
  }

  function step(delta) {
    const index = currentSlide + delta;
    if (index >= 0 && index < totalSlides) goTo(index, true);
  }

  const prev = () => step(-1);
  const next = () => step(1);

  // Tabs pattern: the dots are one Tab stop, arrows move and select.
  const STEP = { ArrowRight: 1, ArrowLeft: -1 };

  function onDotKeydown(e, dot) {
    const index = rovingIndex(e, dot, totalSlides, STEP);
    if (index === undefined) return;
    e.preventDefault();
    goTo(index);
    focusDot(index);
  }

  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e) {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  }
</script>

<div
  class="tessera-carousel"
  role="region"
  aria-roledescription="carousel"
  aria-label="Slide carousel"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
>
  <button
    class="tessera-carousel-arrow tessera-carousel-prev"
    onclick={prev}
    aria-disabled={currentSlide === 0}
    aria-label="Previous slide"
  >
    ‹
  </button>
  <button
    class="tessera-carousel-arrow tessera-carousel-next"
    onclick={next}
    aria-disabled={currentSlide >= totalSlides - 1}
    aria-label="Next slide"
  >
    ›
  </button>

  <div class="tessera-carousel-viewport" bind:this={viewport}>
    <div
      class="tessera-carousel-track"
      style="transform: translateX(-{currentSlide * 100}%)"
    >
      {@render children?.()}
    </div>
  </div>
  <p class="tessera-sr-only" aria-live="polite">{status}</p>

  <div
    class="tessera-carousel-dots"
    role="tablist"
    aria-label="Slide indicators"
  >
    {#each { length: totalSlides }, dot}
      <button
        class="tessera-carousel-dot"
        class:active={dot === currentSlide}
        id={ctx.tabId(dot)}
        role="tab"
        aria-selected={dot === currentSlide}
        aria-controls={ctx.slideId(dot)}
        aria-label="Slide {dot + 1}"
        tabindex={dot === currentSlide ? 0 : -1}
        onclick={() => goTo(dot)}
        onkeydown={(e) => onDotKeydown(e, dot)}
      ></button>
    {/each}
  </div>
</div>

<style>
  /* Previous and Next come first in the markup, so a screen reader reads on
     into the new slide; the grid shows them either side of it. */
  .tessera-carousel {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--tessera-spacing-md) var(--tessera-spacing-sm);
    margin-bottom: var(--tessera-spacing-lg);
    position: relative;
  }

  .tessera-carousel-prev {
    grid-area: 1 / 1;
  }

  .tessera-carousel-next {
    grid-area: 1 / 3;
  }

  .tessera-carousel-viewport {
    grid-area: 1 / 2;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--tessera-border);
  }

  .tessera-carousel-track {
    display: flex;
    transition: transform var(--tessera-transition-normal);
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

  .tessera-carousel-arrow:hover:not([aria-disabled='true']) {
    background-color: var(--tessera-bg-secondary);
  }

  .tessera-carousel-arrow[aria-disabled='true'] {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tessera-carousel-dots {
    grid-area: 2 / 2;
    justify-self: center;
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
</style>
