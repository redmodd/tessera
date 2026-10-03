<script>
  import rawConfig from 'virtual:tessera-config';
  import manifest from 'virtual:tessera-manifest';
  import pageModules from 'virtual:tessera-pages';
  import UserLayout from 'virtual:tessera-layout';
  import Quiz from 'virtual:tessera-quiz';
  import courseRuntime from 'virtual:tessera-course-runtime';
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import LoadingBar from './LoadingBar.svelte';
  import ErrorPage from './ErrorPage.svelte';
  import SessionEnded from './SessionEnded.svelte';
  import PageHost from './PageHost.svelte';
  import DefaultLayout from '../components/DefaultLayout.svelte';
  import { NavigationState } from './navigation.svelte.js';
  import { ProgressState } from './progress.svelte.js';
  import { DEFAULT_PASSING_SCORE } from './defaults.js';
  import { applyBranding } from './branding.js';
  import { CourseSession } from './course-session.svelte.js';
  import { createAdapter } from 'virtual:tessera-adapter';
  import { buildXAPIClient } from 'virtual:tessera-xapi-setup';
  import {
    setPageContext,
    setNavContext,
    setAdapterContext,
    setUserStateStore,
  } from './contexts.js';

  const config = $state(rawConfig);

  const adapter = createAdapter(config, { manifest });

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

  let unmountCourse;
  const session = new CourseSession({
    adapter,
    manifest,
    config,
    progress,
    nav,
    buildXAPIClient: () =>
      buildXAPIClient(config, adapter, courseRuntime?.xapi),
    courseUnmounted: new Promise((r) => (unmountCourse = r)),
  });

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
  setPageContext(pageContext);

  // ---- Navigation context (read by custom chrome components) ----
  // Exposes nav/manifest/progress/config so courses can build custom top bars,
  // menus, tables of contents, etc. that can navigate to specific pages.
  setNavContext({
    nav,
    manifest,
    progress,
    config,
    get canExit() {
      return session.canExit;
    },
    exit: () => session.exit(),
  });

  // ---- Adapter context (read by useQuestion / useQuiz) ----
  setAdapterContext({
    get adapter() {
      return adapter;
    },
  });

  // ---- User-scoped state (read/written by usePersistence) ----
  setUserStateStore(session.userStateStore);

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
        if (gen !== loadGeneration || session.exitPhase) return; // stale
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
        if (gen !== loadGeneration || session.exitPhase) return; // stale
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
    if (!session.persistenceReady) return;
    untrack(() => loadPage(index));
  });

  // ---- Retry ----
  function retryPage() {
    retryKey++;
  }

  // ---- Lifecycle ----
  onMount(async () => {
    applyBranding(document.documentElement, config.branding);
    if (config.title) document.title = config.title;

    const initError = await session.start();
    if (initError) {
      console.error('Tessera: adapter init failed', initError);
      pageError = initError;
      pageLoading = false;
    }
  });

  onDestroy(() => {
    if (auditMode) delete window.__tesseraAudit;
    session.dispose();
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
  <LoadingBar active={pageLoading && !session.exitPhase} />
  {#if session.exitPhase}
    <SessionEnded ended={session.exitPhase === 'ended'} />
  {:else}
    <span hidden {@attach () => unmountCourse}></span>
    {#if UserLayout}
      <UserLayout {page} />
    {:else if chromeMode === 'custom'}
      {@render page()}
    {:else}
      <DefaultLayout {page} />
    {/if}
  {/if}
</div>
