<script>
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from '../runtime/Sidebar.svelte';
  import { requireNavContext } from '../runtime/contexts.js';

  let { page } = $props();
  const { nav, manifest, config, progress } = requireNavContext('DefaultLayout');

  let sidebarOpen = $state(false);

  let progressPercent = $derived(
    manifest.totalPages > 0
      ? Math.round((progress.visitedPages.size / manifest.totalPages) * 100)
      : 0
  );

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function closeSidebar() {
    sidebarOpen = false;
  }

  function handleKeyNav(e) {
    const tag = e.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.target?.closest('[role="radiogroup"], [role="dialog"], .tessera-accordion, .tessera-carousel, .tessera-quiz')) return;

    if (e.key === 'ArrowLeft') { nav.goPrev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nav.goNext(); e.preventDefault(); }
    if (e.key === 'Escape' && sidebarOpen) { closeSidebar(); e.preventDefault(); }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyNav);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyNav);
  });
</script>

<button
  class="tessera-hamburger"
  aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
  aria-expanded={sidebarOpen}
  onclick={toggleSidebar}
>
  <span class="tessera-hamburger-lines">
    <span class="tessera-hamburger-line"></span>
    <span class="tessera-hamburger-line"></span>
    <span class="tessera-hamburger-line"></span>
  </span>
</button>

{#if sidebarOpen}
  <div
    class="tessera-sidebar-overlay visible"
    role="presentation"
    onclick={closeSidebar}
  ></div>
{/if}

<div class="tessera-app" data-chrome="default">
  <aside class="tessera-sidebar" class:open={sidebarOpen} aria-label="Course sidebar">
    <Sidebar
      {manifest}
      {config}
      currentPageIndex={nav.currentPageIndex}
      {nav}
      onnavigate={(index) => nav.goToPage(index)}
      onclose={closeSidebar}
    />
  </aside>

  <main class="tessera-main">
    <div class="tessera-content">
      {@render page()}
    </div>

    <div class="tessera-page-nav">
      <button
        class="tessera-page-nav-btn"
        disabled={!nav.canGoPrev}
        onclick={() => nav.goPrev()}
      >
        ← Previous
      </button>
      <button
        class="tessera-page-nav-btn"
        disabled={!nav.canGoNext}
        onclick={() => nav.goNext()}
      >
        Next →
      </button>
    </div>
  </main>

  <footer class="tessera-progress" aria-label="Course progress">
    <div class="tessera-progress-track" role="progressbar"
         aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}
         aria-label="Course progress">
      <div class="tessera-progress-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="tessera-progress-label">{progress.visitedPages.size} of {manifest.totalPages} pages</div>
  </footer>
</div>
