<script>
  import config from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import UserLayout from 'virtual:tessera-layout';
  import Quiz from 'virtual:tessera-quiz';
  import { onMount, onDestroy, setContext, untrack } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import DefaultLayout from '../components/DefaultLayout.svelte';
  import { NavigationState } from './navigation.svelte.js';
  import { ProgressState } from './progress.svelte.js';
  import { DurationTracker } from './duration.js';
  import { createAdapter } from './adapters/index.js';
  import { buildXAPIClient } from './xapi/setup.js';
  import { registerXAPIClient } from './xapi/registry.js';
  import { TESSERA_PAGE, TESSERA_NAV, TESSERA_ADAPTER, TESSERA_USER_STATE } from './contexts.js';

  // ---- Persistence ----
  const adapter = createAdapter(config);
  let persistenceReady = $state(false);
  // Holds the resolved xAPI client for unload-time markUnloading. Set
  // after adapter.init() resolves and registered globally so useXAPI()
  // can reach it.
  let xapiClient = null;

  // ---- State classes ----
  const progress = new ProgressState();
  const nav = new NavigationState(manifest, progress, config);
  let duration = $state(new DurationTracker(0));

  const gradedQuizIndices = manifest.pages.filter(p => p.quiz?.graded).map(p => p.index);

  // Page loading state
  let PageComponent = $state(null);
  let pageLoading = $state(true);
  let pageError = $state(null);
  let retryKey = $state(0);

  // ---- Page context (reactive, read by Quiz in Step 8) ----
  let pageContext = $state({ quiz: null, passingScore: config.scoring?.passingScore ?? 70 });
  setContext(TESSERA_PAGE, pageContext);

  // ---- Navigation context (read by custom chrome components) ----
  // Exposes nav/manifest/progress/config so courses can build custom top bars,
  // menus, tables of contents, etc. that can navigate to specific pages.
  setContext(TESSERA_NAV, { nav, manifest, progress, config });

  // ---- Adapter context (read by useQuestion / usePersistence) ----
  setContext(TESSERA_ADAPTER, { get adapter() { return adapter; } });

  // ---- User-scoped state (read/written by usePersistence) ----
  // Each call site namespaces under its own key. Persisted to SavedState.u.
  let userState = $state({});
  setContext(TESSERA_USER_STATE, {
    get(key) {
      return key in userState ? userState[key] : null;
    },
    set(key, value) {
      userState[key] = value;
      requestPersist();
    },
  });

  // ---- Chrome mode ----
  // A project-supplied layout.svelte at the project root takes precedence.
  // Otherwise: "default" renders the built-in DefaultLayout; "custom" hides
  // the chrome entirely so a course-owned shell can take over.
  if (UserLayout && config.chrome === 'custom' && import.meta.env?.DEV) {
    console.warn('[tessera] Both layout.svelte and chrome: "custom" are set. layout.svelte wins.');
  }
  const chromeMode = UserLayout
    ? 'user'
    : config.chrome === 'custom'
      ? 'custom'
      : 'default';

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
      progress.markVisited(index);
      if (
        manifest.pages[index].completesOn === 'view' &&
        config.completion.mode === 'manual'
      ) {
        progress.markCompleteManually();
      }
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
  function parseColor(color) {
    if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', color)) {
      return null;
    }
    const el = document.createElement('span');
    el.style.color = color;
    document.documentElement.appendChild(el);
    const computed = getComputedStyle(el).color;
    el.remove();
    const match = computed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return null;
    return { r: +match[1], g: +match[2], b: +match[3] };
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

  function handleQuizComplete(e) {
    const { score } = e.detail;
    const pageIndex = nav.currentPageIndex;
    progress.quizCompleted(pageIndex, score);
    progress.recalculateCompletion(manifest, config);
    progress.recalculateSuccess(manifest, config);
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
      u: { ...userState },
      ...(progress.manuallyCompleted ? { m: 1 } : {}),
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
    // Must come before recalc so manual-mode branches see the latch.
    if (saved.m === 1) {
      progress.markCompleteManually();
    }
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

  // ---- Persistence: coalesced save on state changes ----
  // A single microtask-batched scheduler. Multiple state mutations within one
  // tick collapse to one persistState() call (and one LMS commit). Replaces
  // four independent $effects, each of which used to fire its own write.
  let persistScheduled = false;

  function requestPersist() {
    if (persistScheduled) return;
    if (!persistenceReady) return;
    persistScheduled = true;
    queueMicrotask(() => {
      persistScheduled = false;
      persistState();
    });
  }

  $effect(() => {
    // Subscribe to every signal that influences serializeState():
    //   - currentPageIndex (bookmark)
    //   - progress.version (bumped by markVisited / quizCompleted /
    //     markChunk / markStandaloneQuestion)
    // userState writes go through requestPersist() directly from the setter.
    void nav.currentPageIndex;
    void progress.version;
    untrack(requestPersist);
  });

  // ---- Persistence: report score/completion/success to adapter ----
  // These are no-ops for WebAdapter but used by LMS adapters (Step 10)
  $effect(() => {
    const scores = progress.quizScores;
    if (!persistenceReady || scores.size === 0) return;
    if (gradedQuizIndices.length === 0) return;

    const completedGraded = gradedQuizIndices.filter(i => scores.has(i));
    if (completedGraded.length === 0) return;

    // Divide by total graded count — incomplete quizzes count as 0, matching
    // the recalculateSuccess logic in progress.svelte.ts.
    const average = completedGraded.reduce((sum, i) => sum + (scores.get(i) ?? 0), 0) / gradedQuizIndices.length;

    untrack(() => {
      adapter.setScore(Math.round(average));
      // Under manual mode, success is owned by requireSuccessStatus.
      if (config.completion.mode !== 'manual') {
        adapter.setSuccessStatus(average >= config.scoring.passingScore ? 'passed' : 'failed');
      }
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

  let prevSuccessStatus = $state('unknown');
  $effect(() => {
    const status = progress.successStatus;
    if (!persistenceReady) return;
    if (status === prevSuccessStatus) return;
    prevSuccessStatus = status;
    untrack(() => {
      adapter.setSuccessStatus(status);
      adapter.commit();
    });
  });

  // ---- Exit / Terminate lifecycle ----
  let terminated = false;
  let manualWatchdog = null;

  function handleExit() {
    if (terminated) return;
    terminated = true;
    adapter.saveState(serializeState());
    adapter.setDuration(duration.sessionSeconds);
    // Tell SCORM whether this is a suspend-to-resume close or a normal
    // exit. cmi5/web adapters no-op. Must come before terminate() so the
    // value is committed in the same flush.
    adapter.setExit(progress.completionStatus === 'complete' ? 'normal' : 'suspend');
    adapter.commit();
    // Stop accepting author-issued statements on independent destinations
    // before terminate() so a late `useXAPI().sendStatement(...)` from a
    // beforeunload handler can't slip in after Terminated.
    xapiClient?.markUnloading();
    adapter.terminate();
  }

  // ---- Lifecycle ----
  onMount(async () => {
    applyBranding(config);
    if (config.title) document.title = config.title;

    // Initialize persistence and restore state. Adapter init() may throw
    // for malformed launch params (cmi5 actor JSON, missing fetch URL,
    // failed token request). Surface that to the UI rather than crashing
    // silently — a launch-time error means the LMS context is wrong and
    // the user can't continue regardless.
    try {
      await adapter.init();
    } catch (err) {
      console.error('Tessera: adapter init failed', err);
      pageError = err instanceof Error ? err : new Error(String(err));
      pageLoading = false;
      return;
    }

    // cmi5 §8: an LMS-supplied masteryScore is the authoritative pass
    // threshold for this launch and overrides the manifest. Mutate the
    // imported config object once before any UI reads it so every
    // downstream consumer (recalculateSuccess, navigation gating, Quiz
    // page context) sees the same effective value.
    const lmsMastery = adapter.getMasteryScore?.();
    if (typeof lmsMastery === 'number') {
      config.scoring.passingScore = lmsMastery * 100;
      pageContext.passingScore = lmsMastery * 100;
    }

    const saved = adapter.getState();
    if (saved) {
      restoreState(saved);
      prevCompletionStatus = progress.completionStatus;
      prevSuccessStatus = progress.successStatus;
      adapter.seedLifecycle?.(progress.completionStatus, progress.successStatus);
    }
    persistenceReady = true;

    // Build the xAPI client (custom destinations + cmi5 'lms' shared
    // queue) once the adapter has resolved its launch context. Failure
    // here is non-fatal — courses with no `xapi:` config get null, which
    // is what `useXAPI()` is documented to return when nothing is wired.
    try {
      xapiClient = await buildXAPIClient(config, adapter);
    } catch (err) {
      console.warn('Tessera: xAPI client setup failed', err);
      xapiClient = null;
    }
    registerXAPIClient(xapiClient);

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

    // Dev-only watchdog for `completion.mode: "manual"` without an opt-in
    // trigger check — catches the hook never being called or no completesOn
    // page being reachable.
    if (
      import.meta.env?.DEV &&
      config.completion.mode === 'manual' &&
      config.completion.trigger === undefined &&
      progress.completionStatus === 'incomplete'
    ) {
      manualWatchdog = window.setTimeout(() => {
        if (progress.completionStatus === 'incomplete') {
          console.warn(
            '[tessera] completion.mode is "manual" but the course has not completed after 60s. ' +
              'No page declared `pageConfig.completesOn: "view"` was reached, and no component called ' +
              '`useCompletion().markComplete()`. This is a misconfiguration; set `completion.trigger: "page"` ' +
              'in course.config.js to fail the build instead of waiting at runtime.'
          );
        }
      }, 60_000);
    }
  });

  onDestroy(() => {
    window.removeEventListener('pagehide', handleExit);
    window.removeEventListener('beforeunload', handleExit);
    const appEl = document.getElementById('tessera-app');
    appEl?.removeEventListener('tessera-quiz-complete', handleQuizComplete);
    if (manualWatchdog !== null) {
      clearTimeout(manualWatchdog);
      manualWatchdog = null;
    }
    // Clear the global slot so a stale client from a previous mount
    // can't leak into a fresh one (matters for tests that re-mount).
    registerXAPIClient(null);
  });
</script>

{#snippet page()}
  {#if pageLoading}
    <LoadingSkeleton />
  {:else if pageError}
    <ErrorPage error={pageError} onretry={retryPage} />
  {:else if PageComponent}
    {#if pageContext.quiz}
      <Quiz>
        <PageComponent />
      </Quiz>
    {:else}
      <PageComponent />
    {/if}
  {/if}
{/snippet}

<div id="tessera-app" data-chrome={chromeMode}>
  {#if UserLayout}
    <UserLayout {page} />
  {:else if chromeMode === 'custom'}
    {@render page()}
  {:else}
    <DefaultLayout {page} />
  {/if}
</div>
