<script>
  import { SvelteSet } from 'svelte/reactivity';

  let { manifest, config, currentPageIndex, nav, onnavigate, onclose } =
    $props();

  // Track which sections are collapsed. All expanded by default.
  const collapsedSections = new SvelteSet();

  function toggleSection(slug) {
    if (collapsedSections.has(slug)) {
      collapsedSections.delete(slug);
    } else {
      collapsedSections.add(slug);
    }
  }

  function handlePageClick(pageIndex) {
    if (nav.isPageLocked(pageIndex)) return;
    onnavigate(pageIndex);
    // Close sidebar on mobile
    if (onclose) onclose();
  }
</script>

<div class="tessera-sidebar-header">
  {#if config.branding?.logo}
    <img
      src={config.branding.logo}
      alt={config.title}
      class="tessera-sidebar-logo"
    />
  {/if}
  <h1 class="tessera-sidebar-title">{config.title || '(no title)'}</h1>
</div>

<nav class="tessera-sidebar-nav" aria-label="Course navigation">
  {#each manifest.sections as section (section.slug)}
    <div class="tessera-nav-section">
      <button
        class="tessera-nav-section-title"
        onclick={() => toggleSection(section.slug)}
        aria-expanded={!collapsedSections.has(section.slug)}
      >
        <span>{section.title}</span>
        <svg
          class="tessera-nav-section-chevron"
          class:collapsed={collapsedSections.has(section.slug)}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {#if !collapsedSections.has(section.slug)}
        {#each section.lessons as lesson (lesson.slug)}
          {#if lesson.title}
            <div class="tessera-nav-lesson-title">{lesson.title}</div>
          {/if}
          {#each lesson.pages as page (page.index)}
            {@const locked = nav.isPageLocked(page.index)}
            <button
              class="tessera-nav-page"
              class:locked
              aria-current={page.index === currentPageIndex
                ? 'page'
                : undefined}
              aria-disabled={locked ? 'true' : undefined}
              onclick={() => handlePageClick(page.index)}
              onpointerenter={() => !locked && nav.prefetch(page.index)}
              onfocusin={() => !locked && nav.prefetch(page.index)}
            >
              {#if locked}
                <svg
                  class="tessera-nav-lock-icon"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                  width="12"
                  height="12"
                >
                  <path
                    d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z"
                  />
                </svg>
              {/if}
              {page.title}
            </button>
          {/each}
        {/each}
      {/if}
    </div>
  {/each}
</nav>
