<script>
  import config from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import UserLayout from 'virtual:tessera-layout';
  import Quiz from 'virtual:tessera-quiz';
  import { onMount, onDestroy, setContext, untrack } from 'svelte';
  import LoadingBar from './LoadingBar.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import DefaultLayout from '../components/DefaultLayout.svelte';
  import { NavigationState } from './navigation.svelte.js';
  import { ProgressState } from './progress.svelte.js';
  import { DEFAULT_PASSING_SCORE } from './defaults.js';
  import { applyBranding } from './branding.js';
  import { DurationTracker } from './duration.js';
  import { createAdapter } from 'virtual:tessera-adapter';
  import { structureFingerprint, shouldRestore } from './fingerprint.js';
  import { buildXAPIClient } from 'virtual:tessera-xapi-setup';
  import { registerXAPIClient } from './xapi/registry.js';
  import {
    TESSERA_PAGE,
    TESSERA_NAV,
    TESSERA_ADAPTER,
    TESSERA_USER_STATE,
  } from './contexts.js';

  // ---- Persistence ----
  // The cmi5 auth token, LaunchData and Agent Profile fetches inside init()
  // have no deadline of their own, and the first page waits on all three.
  const INIT_TIMEOUT_MS = 15_000;

  const adapter = createAdapter(config, { manifest });
  const currentFingerprint = structureFingerprint(manifest);
  let persistenceReady = $state(false);
  // Holds the resolved xAPI client for unload-time markUnloading. Set
  // after adapter.init() resolves and registered globally so useXAPI()
  // can reach it.
  let xapiClient = null;

  const gradedQuizIndices = new Set(
    manifest.pages.filter((p) => p.quiz?.graded).map((p) => p.index),
  );

  // ---- State classes ----
  // The Tier-2 auditor appends ?__tessera_audit to unlock navigation so it can
  // scan every page, including ones gated behind a quiz.
  const auditMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('__tessera_audit');
  const progress = new ProgressState(
    gradedQuizIndices,
    config,
    manifest.totalPages,
  );
  const nav = new NavigationState(manifest, progress, config, auditMode);
  nav.setPageModules(pageModules);

  // Layout-independent navigation seam the Tier-2 auditor walks pages through.
  if (auditMode) {
    window.__tesseraAudit = {
      goToIndex: (i) => nav.goToPage(i),
    };
  }
  let duration = $state(new DurationTracker(0));

  const onIdle =
    typeof window !== 'undefined' && window.requestIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (cb) =>
          setTimeout(
            () => cb({ didTimeout: false, timeRemaining: () => 50 }),
            1,
          );

  // Page loading state
  let PageComponent = $state(null);
  let pageLoading = $state(true);
  let pageError = $state(null);
  let retryKey = $state(0);
  // Rendered page index, surfaced on #tessera-app so the auditor can wait for a
  // requested navigation to settle before scanning.
  let renderedPageIndex = $state(-1);

  // ---- Page context (reactive, read by Quiz in Step 8) ----
  let pageContext = $state({
    quiz: null,
    quizState: null,
    passingScore: config.scoring?.passingScore ?? DEFAULT_PASSING_SCORE,
  });
  setContext(TESSERA_PAGE, pageContext);

  // ---- Navigation context (read by custom chrome components) ----
  // Exposes nav/manifest/progress/config so courses can build custom top bars,
  // menus, tables of contents, etc. that can navigate to specific pages.
  setContext(TESSERA_NAV, { nav, manifest, progress, config });

  // ---- Adapter context (read by useQuestion / usePersistence) ----
  setContext(TESSERA_ADAPTER, {
    get adapter() {
      return adapter;
    },
  });

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
    console.warn(
      '[tessera] Both layout.svelte and chrome: "custom" are set. layout.svelte wins.',
    );
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

    const loader = pageModules[page.importPath];
    if (!loader) {
      console.error(
        `Tessera: No loader for page ${index} at ${page.importPath}`,
      );
      pageError = new Error(`Page not found: ${page.importPath}`);
      PageComponent = null;
      pageLoading = false;
      renderedPageIndex = index;
      return;
    }

    loader()
      .then((mod) => {
        if (gen !== loadGeneration) return; // stale
        pageError = null;
        pageContext.quiz = page.quiz;
        pageContext.quizState = {
          attempts: progress.quizAttempts.get(index) ?? 0,
          score: progress.quizScores.get(index) ?? 0,
        };
        PageComponent = mod.default;
        pageLoading = false;
        renderedPageIndex = index;
        progress.markVisited(index);
        if (
          manifest.pages[index].completesOn === 'view' &&
          config.completion.mode === 'manual'
        ) {
          progress.markCompleteManually();
        }
        onIdle(() => nav.prefetch(index + 1));
      })
      .catch((err) => {
        if (gen !== loadGeneration) return; // stale
        console.error(`Tessera: Failed to load page ${index}`, err);
        pageError = err;
        pageLoading = false;
        renderedPageIndex = index;
      });
  }

  // React to page index changes. Held until persistence is restored: a quiz
  // seeds its attempt count from restored progress at mount.
  $effect(() => {
    const index = nav.currentPageIndex;
    const _retry = retryKey;
    if (!persistenceReady) return;
    untrack(() => loadPage(index));
  });

  // ---- Retry ----
  function retryPage() {
    retryKey++;
  }

  function handleQuizComplete(e) {
    const { score } = e.detail;
    progress.quizCompleted(nav.currentPageIndex, score);
  }

  // ---- Persistence: serialize / restore ----
  function serializeState() {
    const q = {};
    for (const [pageIndex, score] of progress.quizScores) {
      q[String(pageIndex)] = score;
    }
    const qa = {};
    for (const [pageIndex, attempts] of progress.quizAttempts) {
      if (attempts > 1) qa[String(pageIndex)] = attempts;
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
      f: currentFingerprint,
      v: [...progress.visitedPages],
      q,
      d: duration.totalSeconds,
      ...(Object.keys(qa).length > 0 ? { qa } : {}),
      ...(progress.chunkProgress.size > 0 ? { c } : {}),
      ...(progress.standaloneQuestionScores.size > 0 ? { s } : {}),
      ...(progress.gradedStandalonePages.size > 0
        ? { gs: [...progress.gradedStandalonePages] }
        : {}),
      ...(Object.keys(userState).length > 0 ? { u: { ...userState } } : {}),
      ...(progress.manuallyCompleted ? { m: 1 } : {}),
    };
  }

  function restoreState(saved) {
    if (!saved) return;
    // Restore visited pages
    for (const idx of saved.v) {
      progress.markVisited(idx);
    }
    // Restore quiz scores and attempt counts (qa absent on older saves)
    for (const [key, score] of Object.entries(saved.q)) {
      progress.restoreQuiz(Number(key), score, Number(saved.qa?.[key] ?? 1));
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
          progress.markStandaloneQuestion(
            pageIndex,
            qid,
            Number(score),
            gradedSet.has(pageIndex),
          );
        }
      }
    }
    // Restore user-scoped state from usePersistence (absent on older saves)
    if (saved.u && typeof saved.u === 'object') {
      userState = { ...userState, ...saved.u };
    }
    // Restore duration
    duration = new DurationTracker(saved.d || 0);
    if (saved.m === 1) {
      progress.markCompleteManually();
    }
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
  // tick collapse to one persistState() call (and one LMS commit).
  let persistScheduled = false;
  let persistPending = false;
  let persistEffectRan = false;

  function requestPersist() {
    if (!persistenceReady) {
      persistPending = true;
      return;
    }
    if (persistScheduled) return;
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
    if (!persistEffectRan) {
      persistEffectRan = true;
      return;
    }
    untrack(requestPersist);
  });

  // ---- Persistence: report score/completion/success to adapter ----
  // These are no-ops for WebAdapter but used by LMS adapters (Step 10)
  let prevReportedScore = null;
  $effect(() => {
    void progress.version;
    if (!persistenceReady) return;

    const { average, attempted } = progress.gradedScore();
    if (!attempted) return;

    const rounded = Math.round(average);
    if (rounded === prevReportedScore) return;
    prevReportedScore = rounded;

    untrack(() => {
      adapter.setScore(rounded);
      // Under manual mode, success is owned by requireSuccessStatus.
      if (config.completion.mode !== 'manual') {
        adapter.setSuccessStatus(
          average >= config.scoring.passingScore ? 'passed' : 'failed',
        );
      }
      adapter.setDuration(duration.sessionSeconds);
      adapter.commit();
    });
  });

  let prevCompletionStatus = 'incomplete';
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

  let prevSuccessStatus = 'unknown';
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
    adapter.setExit(
      progress.completionStatus === 'complete' ? 'normal' : 'suspend',
    );
    adapter.commit();
    // Stop accepting author-issued statements on independent destinations
    // before terminate() so a late `useXAPI().sendStatement(...)` from a
    // beforeunload handler can't slip in after Terminated.
    xapiClient?.markUnloading();
    adapter.terminate();
  }

  // ---- Lifecycle ----
  onMount(async () => {
    applyBranding(document.documentElement, config.branding);
    if (config.title) document.title = config.title;

    // Initialize persistence and restore state. Adapter init() may throw
    // for malformed launch params (cmi5 actor JSON, missing fetch URL,
    // failed token request). Surface that to the UI rather than crashing
    // silently: a launch-time error means the LMS context is wrong and
    // the user can't continue regardless.
    let initDeadline;
    try {
      await Promise.race([
        adapter.init(),
        new Promise((_, reject) => {
          initDeadline = setTimeout(
            () => reject(new Error('adapter init timed out')),
            INIT_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      console.error('Tessera: adapter init failed', err);
      pageError = err instanceof Error ? err : new Error(String(err));
      pageLoading = false;
      return;
    } finally {
      clearTimeout(initDeadline);
    }

    // Separate from init(): the adapter bounds this itself, so a stalled State
    // API costs the bookmark rather than the launch.
    try {
      await adapter.loadState?.();
    } catch (err) {
      console.warn('Tessera: resume state load failed', err);
    }

    // cmi5 §8: an LMS-supplied masteryScore is the authoritative pass
    // threshold for this launch and overrides the manifest. Mutate the
    // imported config object once before any UI reads it so every
    // downstream consumer (the derived completion/success status, navigation
    // gating, Quiz page context) sees the same effective value.
    // The first page is gated on persistenceReady, so a malformed saved
    // document must cost the resume, not the course.
    try {
      const lmsMastery = adapter.getMasteryScore?.();
      if (typeof lmsMastery === 'number') {
        config.scoring.passingScore = lmsMastery * 100;
        pageContext.passingScore = lmsMastery * 100;
      }

      const saved = adapter.getState();
      if (saved && shouldRestore(saved, currentFingerprint, config.resume)) {
        restoreState(saved);
        prevCompletionStatus = progress.completionStatus;
        prevSuccessStatus = progress.successStatus;
        adapter.seedLifecycle?.(
          progress.completionStatus,
          progress.successStatus,
        );
      }
    } catch (err) {
      console.error('Tessera: resume state could not be restored', err);
    } finally {
      persistenceReady = true;
      if (persistPending) {
        persistPending = false;
        requestPersist();
      }
    }

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
              'in course.config.js to fail the build instead of waiting at runtime.',
          );
        }
      }, 60_000);
    }
  });

  onDestroy(() => {
    if (auditMode) delete window.__tesseraAudit;
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
  {#if pageError}
    <ErrorPage error={pageError} onretry={retryPage} />
  {:else if PageComponent}
    {#if pageContext.quiz}
      {#key renderedPageIndex}
        <Quiz>
          <PageComponent />
        </Quiz>
      {/key}
    {:else}
      <PageComponent />
    {/if}
  {/if}
{/snippet}

<div
  id="tessera-app"
  data-chrome={chromeMode}
  data-tessera-page-index={auditMode ? renderedPageIndex : undefined}
  data-tessera-page-error={auditMode && pageError ? 'true' : undefined}
>
  <LoadingBar active={pageLoading} />
  {#if UserLayout}
    <UserLayout {page} />
  {:else if chromeMode === 'custom'}
    {@render page()}
  {:else}
    <DefaultLayout {page} />
  {/if}
</div>
