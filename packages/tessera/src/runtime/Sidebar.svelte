<script>
  let { manifest, config, currentPageIndex, onnavigate, onclose } = $props();

  // Track which sections are collapsed. All expanded by default.
  let collapsedSections = $state(new Set());

  function toggleSection(slug) {
    const next = new Set(collapsedSections);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    collapsedSections = next;
  }

  function handlePageClick(pageIndex) {
    onnavigate(pageIndex);
    // Close sidebar on mobile
    if (onclose) onclose();
  }
</script>

<div class="tessera-sidebar-header">
  {#if config.branding?.logo}
    <img src={config.branding.logo} alt={config.title} class="tessera-sidebar-logo" />
  {/if}
  <h1 class="tessera-sidebar-title">{config.title || '(no title)'}</h1>
</div>

<nav class="tessera-sidebar-nav" aria-label="Course navigation">
  {#each manifest.sections as section}
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
        {#each section.lessons as lesson}
          <div class="tessera-nav-lesson-title">{lesson.title}</div>
          {#each lesson.pages as page}
            <button
              class="tessera-nav-page"
              aria-current={page.index === currentPageIndex ? 'page' : undefined}
              onclick={() => handlePageClick(page.index)}
            >
              {page.title}
            </button>
          {/each}
        {/each}
      {/if}
    </div>
  {/each}
</nav>
