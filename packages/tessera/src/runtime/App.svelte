<script>
  import config from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import { onMount, onDestroy, setContext, untrack } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import DefaultLayout from '../components/DefaultLayout.svelte';
  import { NavigationState } from './navigation.svelte.js';
  import { ProgressState } from './progress.svelte.js';
  import { DurationTracker } from './duration.js';
  import { createAdapter } from './adapters/index.js';

  // ---- Persistence ----
  const adapter = createAdapter(config);
  let persistenceReady = $state(false);

  // ---- State classes ----
  const progress = new ProgressState();
  const nav = new NavigationState(manifest, progress, config);
  let duration = $state(new DurationTracker(0));

  // Page loading state
  let PageComponent = $state(null);
  let pageLoading = $state(true);
  let pageError = $state(null);
  let retryKey = $state(0);

  // ---- Page context (reactive, read by Quiz in Step 8) ----
  let pageContext = $state({ quiz: null, passingScore: config.scoring?.passingScore ?? 70 });
  setContext('tessera-page', pageContext);

  // ---- Navigation context (read by custom chrome components) ----
  // Exposes nav/manifest/progress/config so courses can build custom top bars,
  // menus, tables of contents, etc. that can navigate to specific pages.
  setContext('tessera-nav', { nav, manifest, progress, config });

  // ---- Adapter context (read by useQuestion / usePersistence) ----
  setContext('tessera-adapter', { get adapter() { return adapter; } });

  // ---- User-scoped state (read/written by usePersistence) ----
  // Each call site namespaces under its own key. Persisted to SavedState.u.
  let userState = $state({});
  setContext('tessera-user-state', {
    get(key) {
      return key in userState ? userState[key] : null;
    },
    set(key, value) {
      userState = { ...userState, [key]: value };
      persistState();
    },
  });

  // ---- Chrome mode ----
  // "default" (or unset) renders the built-in DefaultLayout chrome.
  // "custom" hides the chrome so a course-owned shell can take over.
  const chromeMode = config.chrome === 'custom' ? 'custom' : 'default';

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

  // ---- Branding ----
  function parseColor(ctx, color) {
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
      // Create the canvas once here rather than inside parseColor to avoid
      // allocating a new element for every color resolved.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const rgb = ctx ? parseColor(ctx, cfg.branding.primaryColor) : null;
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

  // ---- Quiz completion handler ----
  function handleQuizComplete(e) {
    const { score, interactions = [] } = e.detail;
    const pageIndex = nav.currentPageIndex;
    progress.quizCompleted(pageIndex, score);
    for (const { id, interaction, correct } of interactions) {
      adapter.reportInteraction(id, interaction, correct);
    }
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
    const c = {};
    for (const [pageIndex, chunkIndex] of progress.chunkProgress) {
      c[String(pageIndex)] = chunkIndex;
    }
    const s = {};
    for (const [pageIndex, questionMap] of progress.standaloneQuestionScores) {
      const obj = {};
      for (const [qid, score] of questionMap) obj[qid] = score;
      s[String(pageIndex)] = obj;
    }
    return {
      b: nav.currentPageIndex,
      v: [...progress.visitedPages],
      q,
      d: duration.totalSeconds,
      c,
      s,
      gs: [...progress.gradedStandalonePages],
      u: userState,
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
    // Restore chunk progress (may be absent on state saved before this field existed)
    if (saved.c) {
      for (const [key, chunkIndex] of Object.entries(saved.c)) {
        progress.markChunk(Number(key), Number(chunkIndex));
      }
    }
    // Restore standalone question scores (absent on state saved before useQuestion existed)
    if (saved.s) {
      const gradedSet = new Set((saved.gs ?? []).map(Number));
      for (const [pageKey, questions] of Object.entries(saved.s)) {
        const pageIndex = Number(pageKey);
        for (const [qid, score] of Object.entries(questions)) {
          progress.markStandaloneQuestion(pageIndex, qid, Number(score), gradedSet.has(pageIndex));
        }
      }
    }
    // Restore user-scoped state from usePersistence (absent on older saves)
    if (saved.u && typeof saved.u === 'object') {
      userState = { ...saved.u };
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
  let prevChunksSignature = $state(null);

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

  $effect(() => {
    // Signature reflects every chunk advance (set size alone is not enough since
    // the same page can advance from chunk 0 → 1 → 2 without growing the map).
    const sig = [...progress.chunkProgress]
      .map(([p, c]) => `${p}:${c}`)
      .join(',');
    if (prevChunksSignature !== null && sig !== prevChunksSignature) {
      untrack(() => persistState());
    }
    prevChunksSignature = sig;
  });

  // ---- Persistence: report score/completion/success to adapter ----
  // These are no-ops for WebAdapter but used by LMS adapters (Step 10)
  $effect(() => {
    const scores = progress.quizScores;
    if (!persistenceReady || scores.size === 0) return;

    const gradedQuizIndices = manifest.pages.filter(p => p.quiz?.graded).map(p => p.index);
    const completedGraded = gradedQuizIndices.filter(i => scores.has(i));
    if (completedGraded.length === 0) return;

    // Divide by total graded count — incomplete quizzes count as 0, matching
    // the recalculateSuccess logic in progress.svelte.ts.
    const average = completedGraded.reduce((sum, i) => sum + scores.get(i), 0) / gradedQuizIndices.length;

    untrack(() => {
      adapter.setScore(Math.round(average));
      adapter.setSuccessStatus(average >= config.scoring.passingScore ? 'passed' : 'failed');
      adapter.setDuration(duration.sessionSeconds);
      adapter.commit();
    });
  });

  let prevCompletionStatus = $state('incomplete');
  $effect(() => {
    const status = progress.completionStatus;
    if (!persistenceReady) return;
    if (status === prevCompletionStatus) return;
    prevCompletionStatus = status;
    untrack(() => {
      adapter.setCompletionStatus(status);
      adapter.setDuration(duration.sessionSeconds);
      adapter.commit();
    });
  });

  // ---- Exit / Terminate lifecycle ----
  let terminated = false;

  function handleExit() {
    if (terminated) return;
    terminated = true;
    adapter.saveState(serializeState());
    adapter.setDuration(duration.sessionSeconds);
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
      prevCompletionStatus = progress.completionStatus;
    }
    persistenceReady = true;

    // Push initial completion + success status to the adapter so LMSes never
    // see the SCORM default ("unknown") on Terminate — SCORM Cloud rolls that
    // up to "completed"/"passed" during status rollup.
    adapter.setCompletionStatus(progress.completionStatus);
    adapter.setSuccessStatus(progress.successStatus);
    adapter.commit();

    window.addEventListener('pagehide', handleExit);
    window.addEventListener('beforeunload', handleExit);
    const appEl = document.getElementById('tessera-app');
    appEl?.addEventListener('tessera-quiz-complete', handleQuizComplete);
  });

  onDestroy(() => {
    window.removeEventListener('pagehide', handleExit);
    window.removeEventListener('beforeunload', handleExit);
    const appEl = document.getElementById('tessera-app');
    appEl?.removeEventListener('tessera-quiz-complete', handleQuizComplete);
  });
</script>

{#snippet page()}
  {#if pageLoading}
    <LoadingSkeleton />
  {:else if pageError}
    <ErrorPage error={pageError} onretry={retryPage} />
  {:else if PageComponent}
    <PageComponent />
  {/if}
{/snippet}

<div id="tessera-app" data-chrome={chromeMode}>
  {#if chromeMode === 'custom'}
    {@render page()}
  {:else}
    <DefaultLayout {page} />
  {/if}
</div>
