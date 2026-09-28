<script>
  import {
    useCourse,
    useNavigation,
    useProgress,
  } from '../runtime/hooks.svelte.js';
  import Sidebar from './Sidebar.svelte';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
  const course = useCourse();

  let sidebarOpen = $state(false);
  let exitDialog = $state();

  let progressPercent = $derived(
    nav.pages.length > 0
      ? Math.round((progress.completedPages / nav.pages.length) * 100)
      : 0,
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
    if (
      e.target?.closest(
        'dialog, [role="radiogroup"], [role="dialog"], .tessera-accordion, .tessera-carousel, .tessera-quiz',
      )
    )
      return;

    if (e.key === 'ArrowLeft') {
      nav.prev();
      e.preventDefault();
    }
    if (e.key === 'ArrowRight') {
      nav.next();
      e.preventDefault();
    }
    if (e.key === 'Escape' && sidebarOpen) {
      closeSidebar();
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={handleKeyNav} />

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
  <aside
    class="tessera-sidebar"
    class:open={sidebarOpen}
    aria-label="Course sidebar"
  >
    <Sidebar onclose={closeSidebar} />
    {#if course.canExit}
      <div class="tessera-sidebar-footer">
        <button
          class="tessera-page-nav-btn tessera-exit-btn"
          onclick={() => exitDialog.showModal()}
        >
          Exit course
        </button>
      </div>
      <dialog
        class="tessera-exit-dialog"
        aria-labelledby="tessera-exit-title"
        bind:this={exitDialog}
      >
        <h2 id="tessera-exit-title">Exit the course?</h2>
        <p>Your progress will be saved.</p>
        <div class="tessera-exit-dialog-actions">
          <button
            class="tessera-page-nav-btn"
            onclick={() => exitDialog.close()}
          >
            Cancel
          </button>
          <button
            class="tessera-page-nav-btn tessera-btn-primary"
            onclick={() => {
              exitDialog.close();
              course.exit();
            }}
          >
            Exit course
          </button>
        </div>
      </dialog>
    {/if}
  </aside>

  <main class="tessera-main">
    <div class="tessera-content">
      {@render page()}
    </div>

    <div class="tessera-page-nav">
      <button
        class="tessera-page-nav-btn"
        disabled={!nav.canGoPrev}
        onclick={() => nav.prev()}
      >
        ← Previous
      </button>
      <button
        class="tessera-page-nav-btn"
        disabled={!nav.canGoNext}
        onclick={() => nav.next()}
        onpointerenter={() => nav.prefetch(nav.currentPageIndex + 1)}
        onfocusin={() => nav.prefetch(nav.currentPageIndex + 1)}
      >
        Next →
      </button>
    </div>
  </main>

  <footer class="tessera-progress" aria-label="Course progress">
    <div
      class="tessera-progress-track"
      role="progressbar"
      aria-valuenow={progressPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Course progress"
    >
      <div
        class="tessera-progress-fill"
        style="width: {progressPercent}%"
      ></div>
    </div>
    <div class="tessera-progress-label">
      {progress.completedPages} of {nav.pages.length} pages
    </div>
  </footer>
</div>
