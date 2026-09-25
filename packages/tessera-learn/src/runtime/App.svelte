<script>
  import rawConfig from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import UserLayout from 'virtual:tessera-layout';
  import Quiz from 'virtual:tessera-quiz';
  import courseRuntime from 'virtual:tessera-course-runtime';
  import { onMount, onDestroy, setContext, tick, untrack } from 'svelte';
  import LoadingBar from './LoadingBar.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import PageHost from './PageHost.svelte';
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

  const config = $state(rawConfig);

  const adapter = createAdapter(config, { manifest });
  const currentFingerprint = structureFingerprint(manifest);
  let persistenceReady = $state(false);
  // Holds the resolved xAPI client for unload-time markUnloading. Set
  // after adapter.init() resolves and registered globally so useXAPI()
  // can reach it.
  let xapiClient = null;

  // ---- State classes ----
  // The Tier-2 auditor appends ?__tessera_audit to unlock navigation so it can
  // scan every page, including ones gated behind a quiz.
  const auditMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('__tessera_audit');
  const progress = new ProgressState(manifest, config);
  const nav = new NavigationState(manifest, progress, config, {
    auditMode,
    canAccess: courseRuntime?.canAccess,
  });
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
    get passingScore() {
      return config.scoring?.passingScore ?? DEFAULT_PASSING_SCORE;
    },
    get index() {
      return renderedPageIndex < 0 ? undefined : renderedPageIndex;
    },
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
          attempts: progress.quizAttempts(index),
          score: progress.quizScore(index) ?? 0,
        };
        PageComponent = mod.default;
        pageLoading = false;
        renderedPageIndex = index;
        progress.markVisited(index);
        tick().then(() => progress.pageMounted(index));
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

  // ---- Persistence: serialize / restore ----
  function serializeState() {
    const c = {};
    for (const [pageIndex, chunkIndex] of progress.chunkProgress) {
      c[String(pageIndex)] = chunkIndex;
    }
    const g = {};
    for (const [pageIndex, unit] of progress.gradedUnits) {
      const entry = {};
      if (unit.quizScore !== undefined) entry.s = unit.quizScore;
      if (unit.attempts > 1) entry.a = unit.attempts;
      if (unit.questions?.size) {
        const questions = {};
        for (const [qid, { score, weight, graded }] of unit.questions) {
          questions[qid] =
            graded && weight === 1 ? score : [score, weight, graded ? 1 : 0];
        }
        entry.q = questions;
      }
      const unanswered = progress.unlistedUnanswered(pageIndex);
      if (unanswered.length > 0) entry.w = unanswered;
      if (Object.keys(entry).length > 0) g[String(pageIndex)] = entry;
    }
    return {
      b: nav.currentPageIndex,
      f: currentFingerprint,
      v: [...progress.visitedPages],
      d: duration.totalSeconds,
      ...(Object.keys(g).length > 0 ? { g } : {}),
      ...(progress.chunkProgress.size > 0 ? { c } : {}),
      ...(Object.keys(userState).length > 0 ? { u: { ...userState } } : {}),
      ...(progress.manuallyCompleted ? { m: 1 } : {}),
      ...(progress.gradedScoreDecided ? { s: 1 } : {}),
      ...(progress.reportedCompletionStatus === 'complete' ? { k: 1 } : {}),
      ...(progress.passScore !== null ? { p: progress.passScore } : {}),
    };
  }

  function restoreState(saved) {
    if (!saved) return;
    const latches = {
      decided: saved.s === 1,
      completed: saved.k === 1,
      passScore: typeof saved.p === 'number' ? saved.p : null,
    };
    progress.replay(() => {
      for (const idx of saved.v) {
        progress.markVisited(idx);
      }
      // Restore chunk progress (absent when no page reveals content in stages)
      if (saved.c) {
        for (const [key, chunkIndex] of Object.entries(saved.c)) {
          progress.markChunk(Number(key), chunkIndex);
        }
      }
      if (saved.g) {
        for (const [key, unit] of Object.entries(saved.g)) {
          const pageIndex = Number(key);
          if (unit.s !== undefined) {
            progress.restoreQuiz(pageIndex, unit.s, unit.a ?? 1);
          }
          if (unit.w) progress.restoreUnanswered(pageIndex, unit.w);
          for (const [qid, entry] of Object.entries(unit.q ?? {})) {
            const [score, weight, graded] = Array.isArray(entry)
              ? entry
              : [entry, 1, 1];
            progress.markStandaloneQuestion(
              pageIndex,
              qid,
              score,
              graded === 1,
              weight,
            );
          }
        }
      }
      if (saved.m === 1) {
        progress.markCompleteManually();
      }
    }, latches);
    // Restore user-scoped state from usePersistence (absent on older saves)
    if (saved.u && typeof saved.u === 'object') {
      userState = { ...userState, ...saved.u };
    }
    // Restore duration
    duration = new DurationTracker(saved.d);
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

  const launchPageIndex = nav.currentPageIndex;
  const launchVersion = progress.version;

  $effect(() => {
    // Subscribe to every signal that influences serializeState():
    //   - currentPageIndex (bookmark)
    //   - progress.version (bumped by markVisited / quizCompleted /
    //     markChunk / markStandaloneQuestion)
    // userState writes go through requestPersist() directly from the setter.
    const pageIndex = nav.currentPageIndex;
    const version = progress.version;
    if (!persistEffectRan) {
      persistEffectRan = true;
      if (pageIndex === launchPageIndex && version === launchVersion) return;
    }
    untrack(requestPersist);
  });

  // ---- Persistence: report score/completion/success to adapter ----
  let prevReportedScore = null;
  let prevSuccessStatus = 'unknown';
  $effect(() => {
    if (!persistenceReady) return;

    if (!progress.gradedScoreFinal) return;

    const score = progress.reportedScore;
    if (score === prevReportedScore) return;
    prevReportedScore = score;

    untrack(() => {
      adapter.setScore(score);
      // Before the commit, so a verdict this score decides carries it and
      // xAPI/cmi5 send one statement rather than a Scored and a Passed.
      prevSuccessStatus = progress.successStatus;
      adapter.setSuccessStatus(prevSuccessStatus);
      adapter.setDuration(duration.sessionSeconds);
      adapter.commit();
    });
  });

  let prevCompletionStatus = 'incomplete';
  $effect(() => {
    const status = progress.reportedCompletionStatus;
    if (!persistenceReady) return;
    if (status === prevCompletionStatus) return;
    prevCompletionStatus = status;
    untrack(() => {
      adapter.setCompletionStatus(status);
      adapter.setDuration(duration.sessionSeconds);
      adapter.commit();
    });
  });

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
      progress.reportedCompletionStatus === 'complete' ? 'normal' : 'suspend',
    );
    adapter.commit();
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
      await adapter.loadState();
    } catch (err) {
      console.warn('Tessera: resume state load failed', err);
    }

    // An LMS-supplied mastery score is the authoritative pass threshold for
    // this launch and overrides the manifest. `config` is a $state proxy, so
    // this one write re-derives every consumer: completion and success status,
    // navigation gating, the Quiz page context, and useProgress().passingScore
    // in a custom layout.
    const lmsMastery = adapter.getMasteryScore();
    if (lmsMastery !== null) {
      config.scoring.passingScore = Number((lmsMastery * 100).toPrecision(15));
    }

    // The first page is gated on persistenceReady, so a malformed saved
    // document must cost the resume, not the course.
    try {
      const saved = adapter.getState();
      if (saved && shouldRestore(saved, currentFingerprint, config.resume)) {
        restoreState(saved);
        prevCompletionStatus = progress.reportedCompletionStatus;
        prevSuccessStatus = progress.successStatus;
        const seededScore = progress.gradedScoreFinal
          ? progress.reportedScore
          : null;
        if (
          adapter.seedLifecycle(
            progress.reportedCompletionStatus,
            progress.successStatus,
            seededScore,
          )
        ) {
          prevReportedScore = seededScore;
        }
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
      xapiClient = await buildXAPIClient(config, adapter, courseRuntime?.xapi);
    } catch (err) {
      console.warn('Tessera: xAPI client setup failed', err);
      xapiClient = null;
    }
    registerXAPIClient(xapiClient);

    // Push initial completion + success status to the adapter so LMSes never
    // see the SCORM default ("unknown") on Terminate — SCORM Cloud rolls that
    // up to "completed"/"passed" during status rollup.
    adapter.setCompletionStatus(progress.reportedCompletionStatus);
    adapter.setSuccessStatus(progress.successStatus);
    adapter.commit();

    window.addEventListener('pagehide', handleExit);

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
    <PageHost>
      {#if pageContext.quiz}
        {#key renderedPageIndex}
          <Quiz>
            <PageComponent />
          </Quiz>
        {/key}
      {:else}
        <PageComponent />
      {/if}
    </PageHost>
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
