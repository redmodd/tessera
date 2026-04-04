<script>
  import config from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import { onMount, setContext, untrack } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import Sidebar from './Sidebar.svelte';

  // ---- State ----
  let currentPageIndex = $state(0);
  let visitedPages = $state(new Set());
  let sidebarOpen = $state(false);

  // Page loading state
  let PageComponent = $state(null);
  let pageLoading = $state(true);
  let pageError = $state(null);
  let retryKey = $state(0);

  // ---- Derived ----
  let canGoPrev = $derived(currentPageIndex > 0);
  let canGoNext = $derived(currentPageIndex < manifest.totalPages - 1);
  let progressPercent = $derived(
    manifest.totalPages > 0
      ? Math.round((visitedPages.size / manifest.totalPages) * 100)
      : 0
  );

  // ---- Page context (reactive, read by Quiz in Step 8) ----
  let pageContext = $state({ quiz: null });
  setContext('tessera-page', pageContext);

  // ---- Page loading ----
  let loadGeneration = 0; // guard against stale loads

  function loadPage(index) {
    const page = manifest.pages[index];
    if (!page) return;

    const gen = ++loadGeneration;
    pageLoading = true;
    pageError = null;
    PageComponent = null;

    // Update context for the new page
    pageContext.quiz = page.quiz;

    const loader = pageModules[page.importPath];
    if (!loader) {
      console.error(`Tessera: No loader for page ${index} at ${page.importPath}`);
      pageError = new Error(`Page not found: ${page.importPath}`);
      pageLoading = false;
      return;
    }

    loader().then(mod => {
      if (gen !== loadGeneration) return; // stale
      PageComponent = mod.default;
      pageLoading = false;
      // Mark visited
      visitedPages = new Set([...visitedPages, index]);
    }).catch(err => {
      if (gen !== loadGeneration) return; // stale
      console.error(`Tessera: Failed to load page ${index}`, err);
      pageError = err;
      pageLoading = false;
    });
  }

  // React to page index changes — only subscribe to currentPageIndex and retryKey
  $effect(() => {
    const index = currentPageIndex;
    const _retry = retryKey;
    untrack(() => loadPage(index));
  });

  // ---- Navigation ----
  function goToPage(index) {
    if (index < 0 || index >= manifest.totalPages) return;
    currentPageIndex = index;
  }

  function goNext() {
    if (canGoNext) goToPage(currentPageIndex + 1);
  }

  function goPrev() {
    if (canGoPrev) goToPage(currentPageIndex - 1);
  }

  function retryPage() {
    retryKey++;
  }

  // ---- Mobile sidebar ----
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function closeSidebar() {
    sidebarOpen = false;
  }

  // ---- Branding ----
  function parseColor(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    if (ctx.fillStyle === '#000000'
        && color.trim().toLowerCase() !== '#000000'
        && color.trim().toLowerCase() !== '#000'
        && color.trim().toLowerCase() !== 'black') {
      return null;
    }
    const hex = ctx.fillStyle;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function applyBranding(cfg) {
    const el = document.documentElement;
    if (cfg.branding?.primaryColor) {
      el.style.setProperty('--tessera-primary', cfg.branding.primaryColor);
      const rgb = parseColor(cfg.branding.primaryColor);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        el.style.setProperty('--tessera-primary-light', `hsl(${hsl.h}, ${Math.min(hsl.s + 10, 100)}%, 90%)`);
        el.style.setProperty('--tessera-primary-dark', `hsl(${hsl.h}, ${Math.min(hsl.s + 10, 100)}%, ${Math.max(hsl.l - 15, 10)}%)`);
        el.style.setProperty('--tessera-focus-ring', `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
      }
    }
    if (cfg.branding?.fontFamily) {
      el.style.setProperty('--tessera-font-family', cfg.branding.fontFamily);
    }
  }

  // ---- Keyboard shortcuts ----
  function handleKeyNav(e) {
    const tag = e.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.target?.closest('[role="radiogroup"], [role="dialog"], .tessera-accordion, .tessera-carousel')) return;

    if (e.key === 'ArrowLeft') { goPrev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { goNext(); e.preventDefault(); }
    if (e.key === 'Escape' && sidebarOpen) { closeSidebar(); e.preventDefault(); }
  }

  // ---- Lifecycle ----
  onMount(() => {
    applyBranding(config);
    if (config.title) document.title = config.title;

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  });
</script>

<!-- Hamburger button (visible on tablet/mobile only via CSS) -->
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

<!-- Sidebar overlay backdrop (mobile) -->
{#if sidebarOpen}
  <div
    class="tessera-sidebar-overlay visible"
    role="presentation"
    onclick={closeSidebar}
  ></div>
{/if}

<div class="tessera-app" id="tessera-app">
  <div class="tessera-sidebar" class:open={sidebarOpen}>
    <Sidebar
      {manifest}
      {config}
      {currentPageIndex}
      onnavigate={goToPage}
      onclose={closeSidebar}
    />
  </div>

  <main class="tessera-main">
    <div class="tessera-content">
      {#if pageLoading}
        <LoadingSkeleton />
      {:else if pageError}
        <ErrorPage error={pageError} onretry={retryPage} />
      {:else if PageComponent}
        <PageComponent />
      {/if}
    </div>

    <div class="tessera-page-nav">
      <button
        class="tessera-page-nav-btn"
        disabled={!canGoPrev}
        onclick={goPrev}
      >
        ← Previous
      </button>
      <button
        class="tessera-page-nav-btn"
        disabled={!canGoNext}
        onclick={goNext}
      >
        Next →
      </button>
    </div>
  </main>

  <div class="tessera-progress">
    <div class="tessera-progress-track" role="progressbar"
         aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}
         aria-label="Course progress">
      <div class="tessera-progress-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="tessera-progress-label">{visitedPages.size} of {manifest.totalPages} pages</div>
  </div>
</div>
