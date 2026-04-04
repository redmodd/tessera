<script>
  import config from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import { onMount, setContext, untrack } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import Sidebar from './Sidebar.svelte';
  import { NavigationState } from './navigation.svelte.js';
  import { ProgressState } from './progress.svelte.js';
  import { DurationTracker } from './duration.js';
  import { WebAdapter } from './adapters/web.js';

  // ---- Persistence ----
  const adapter = new WebAdapter(config.title || '');
  let persistenceReady = $state(false);

  // ---- State classes ----
  const progress = new ProgressState();
  const nav = new NavigationState(manifest, progress, config);
  let duration = $state(new DurationTracker(0));

  // Mobile sidebar
  let sidebarOpen = $state(false);

  // Page loading state
  let PageComponent = $state(null);
  let pageLoading = $state(true);
  let pageError = $state(null);
  let retryKey = $state(0);

  // ---- Derived ----
  let progressPercent = $derived(
    manifest.totalPages > 0
      ? Math.round((progress.visitedPages.size / manifest.totalPages) * 100)
      : 0
  );

  // ---- Page context (reactive, read by Quiz in Step 8) ----
  let pageContext = $state({ quiz: null, passingScore: config.scoring?.passingScore ?? 70 });
  setContext('tessera-page', pageContext);

  // ---- Page loading ----
  let loadGeneration = 0;

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
      // Mark visited and recalculate
      progress.markVisited(index);
      progress.recalculateCompletion(manifest, config);
      progress.recalculateSuccess(manifest, config);
    }).catch(err => {
      if (gen !== loadGeneration) return; // stale
      console.error(`Tessera: Failed to load page ${index}`, err);
      pageError = err;
      pageLoading = false;
    });
  }

  // React to page index changes
  $effect(() => {
    const index = nav.currentPageIndex;
    const _retry = retryKey;
    untrack(() => loadPage(index));
  });

  // ---- Retry ----
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
    if (e.target?.closest('[role="radiogroup"], [role="dialog"], .tessera-accordion, .tessera-carousel, .tessera-quiz')) return;

    if (e.key === 'ArrowLeft') { nav.goPrev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nav.goNext(); e.preventDefault(); }
    if (e.key === 'Escape' && sidebarOpen) { closeSidebar(); e.preventDefault(); }
  }

  // ---- Quiz completion handler ----
  function handleQuizComplete(e) {
    const { score } = e.detail;
    const pageIndex = nav.currentPageIndex;
    progress.quizCompleted(pageIndex, score);
    progress.recalculateCompletion(manifest, config);
    progress.recalculateSuccess(manifest, config);
    persistState();
  }

  // ---- Persistence: serialize / restore ----
  function serializeState() {
    const q = {};
    for (const [pageIndex, score] of progress.quizScores) {
      q[String(pageIndex)] = score;
    }
    return {
      b: nav.currentPageIndex,
      v: [...progress.visitedPages],
      q,
      d: duration.totalSeconds,
    };
  }

  function restoreState(saved) {
    if (!saved) return;
    // Restore visited pages
    for (const idx of saved.v) {
      progress.markVisited(idx);
    }
    // Restore quiz scores
    for (const [key, score] of Object.entries(saved.q)) {
      progress.quizCompleted(Number(key), score);
    }
    // Restore duration
    duration = new DurationTracker(saved.d || 0);
    // Recalculate derived state
    progress.recalculateCompletion(manifest, config);
    progress.recalculateSuccess(manifest, config);
    // Navigate to bookmark (after state is restored so locking is correct)
    if (saved.b > 0 && saved.b < manifest.totalPages) {
      nav.goToPage(saved.b);
    }
  }

  function persistState() {
    if (!persistenceReady) return;
    adapter.saveState(serializeState());
  }

  // ---- Persistence: save on state changes ----
  // Track previous values to avoid saving on initial load
  let prevPageIndex = $state(-1);
  let prevVisitedSize = $state(-1);
  let prevScoresSize = $state(-1);

  $effect(() => {
    const idx = nav.currentPageIndex;
    if (prevPageIndex >= 0 && idx !== prevPageIndex) {
      untrack(() => persistState());
    }
    prevPageIndex = idx;
  });

  $effect(() => {
    const size = progress.visitedPages.size;
    if (prevVisitedSize >= 0 && size !== prevVisitedSize) {
      untrack(() => persistState());
    }
    prevVisitedSize = size;
  });

  $effect(() => {
    const size = progress.quizScores.size;
    if (prevScoresSize >= 0 && size !== prevScoresSize) {
      untrack(() => persistState());
    }
    prevScoresSize = size;
  });

  // ---- Persistence: report score/completion/success to adapter ----
  // These are no-ops for WebAdapter but used by LMS adapters (Step 10)
  $effect(() => {
    const scores = progress.quizScores;
    if (!persistenceReady || scores.size === 0) return;

    const gradedQuizIndices = manifest.pages.filter(p => p.quiz?.graded).map(p => p.index);
    const completedGraded = gradedQuizIndices.filter(i => scores.has(i));
    if (completedGraded.length === 0) return;

    const average = completedGraded.reduce((sum, i) => sum + scores.get(i), 0) / gradedQuizIndices.length;

    untrack(() => {
      adapter.setScore(Math.round(average));
      adapter.setSuccessStatus(average >= config.scoring.passingScore ? 'passed' : 'failed');
      adapter.setDuration(duration.totalSeconds);
      adapter.commit();
    });
  });

  $effect(() => {
    const status = progress.completionStatus;
    if (!persistenceReady) return;
    untrack(() => {
      adapter.setCompletionStatus(status);
      adapter.setDuration(duration.totalSeconds);
      adapter.commit();
    });
  });

  // ---- Exit / Terminate lifecycle ----
  let terminated = false;

  function handleExit() {
    if (terminated) return;
    terminated = true;
    adapter.saveState(serializeState());
    adapter.setDuration(duration.totalSeconds);
    adapter.commit();
    adapter.terminate();
  }

  // ---- Lifecycle ----
  onMount(async () => {
    applyBranding(config);
    if (config.title) document.title = config.title;

    // Initialize persistence and restore state
    await adapter.init();
    const saved = adapter.getState();
    if (saved) {
      restoreState(saved);
    }
    persistenceReady = true;

    window.addEventListener('keydown', handleKeyNav);
    window.addEventListener('pagehide', handleExit);
    window.addEventListener('beforeunload', handleExit);
    const appEl = document.getElementById('tessera-app');
    appEl?.addEventListener('tessera-quiz-complete', handleQuizComplete);
    return () => {
      window.removeEventListener('keydown', handleKeyNav);
      window.removeEventListener('pagehide', handleExit);
      window.removeEventListener('beforeunload', handleExit);
      appEl?.removeEventListener('tessera-quiz-complete', handleQuizComplete);
    };
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
      currentPageIndex={nav.currentPageIndex}
      {nav}
      onnavigate={(index) => nav.goToPage(index)}
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

  <div class="tessera-progress">
    <div class="tessera-progress-track" role="progressbar"
         aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}
         aria-label="Course progress">
      <div class="tessera-progress-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="tessera-progress-label">{progress.visitedPages.size} of {manifest.totalPages} pages</div>
  </div>
</div>
