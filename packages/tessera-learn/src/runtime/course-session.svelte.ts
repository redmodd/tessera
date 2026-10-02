import { untrack } from 'svelte';
import { DurationTracker } from './duration.js';
import { structureFingerprint, shouldRestore } from './fingerprint.js';
import { isRecord, type CourseConfig } from './types.js';
import { registerXAPIClient } from './xapi/registry.js';
import type { BaseAdapter } from './adapters/base.js';
import type { Manifest } from '../plugin/manifest.js';
import type { NavigationState } from './navigation.svelte.js';
import type { ProgressState } from './progress.svelte.js';
import type { UserStateStore } from './contexts.js';
import type {
  CompletionStatus,
  SavedState,
  SuccessStatus,
} from './persistence.js';
import type { XAPIClient } from './xapi/client.js';

// The cmi5 auth token, LaunchData and Agent Profile fetches inside init()
// have no deadline of their own, and the first page waits on all three.
const INIT_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;

type ExitPhase = 'ending' | 'ended';

interface CourseSessionDeps {
  adapter: BaseAdapter;
  manifest: Manifest;
  /** A `$state` proxy, so the LMS mastery override re-derives every consumer. */
  config: CourseConfig;
  progress: ProgressState;
  nav: NavigationState;
  buildXAPIClient: () => Promise<XAPIClient | null>;
  /** Resolves once the course UI has unmounted, so the final save sees its last writes. */
  courseUnmounted: Promise<void>;
}

export class CourseSession {
  #adapter: BaseAdapter;
  #config: CourseConfig;
  #progress: ProgressState;
  #nav: NavigationState;
  #buildXAPIClient: () => Promise<XAPIClient | null>;
  #courseUnmounted: Promise<void>;
  #fingerprint: string;
  #destroyEffects: () => void;
  #listeners = new AbortController();

  #persistenceReady = $state(false);
  #terminated = $state(false);
  #disposed = false;
  #exitPhase = $state<ExitPhase | null>(null);
  #duration = new DurationTracker(0);
  #xapiClient: XAPIClient | null = null;

  // Each usePersistence call site namespaces under its own key. Saved to SavedState.u.
  #userState = $state<Record<string, unknown>>({});
  #unsavableKeys = new Set<string>();

  #persistScheduled = false;
  #persistPending = false;

  #prevReportedScore: number | null = null;
  #prevSuccessStatus: SuccessStatus = 'unknown';
  #prevCompletionStatus: CompletionStatus = 'incomplete';

  readonly userStateStore: UserStateStore = {
    get: (key) =>
      Object.hasOwn(this.#userState, key) ? this.#userState[key] : null,
    set: (key, value) => {
      this.#userState[key] = value;
      this.#requestPersist();
    },
  };

  constructor({
    adapter,
    manifest,
    config,
    progress,
    nav,
    buildXAPIClient,
    courseUnmounted,
  }: CourseSessionDeps) {
    this.#adapter = adapter;
    this.#config = config;
    this.#progress = progress;
    this.#nav = nav;
    this.#buildXAPIClient = buildXAPIClient;
    this.#courseUnmounted = courseUnmounted;
    this.#fingerprint = structureFingerprint(manifest);

    this.#destroyEffects = $effect.root(() => {
      this.#trackChanges();
      this.#reportStatus();
      this.#watchManualCompletion();
    });
  }

  get persistenceReady(): boolean {
    return this.#persistenceReady;
  }

  get exitPhase(): ExitPhase | null {
    return this.#exitPhase;
  }

  get canExit(): boolean {
    return (
      this.#adapter.connected &&
      this.#persistenceReady &&
      !this.#terminated &&
      !this.#exitPhase
    );
  }

  /**
   * Resolves with the error when adapter init fails or times out: the learner
   * can't continue regardless. Failures after init reject.
   */
  async start(): Promise<Error | null> {
    const adapter = this.#adapter;
    const progress = this.#progress;
    let initDeadline: ReturnType<typeof setTimeout> | undefined;
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
      return err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(initDeadline);
    }
    if (this.#disposed) return null;

    // Separate from init(): the adapter bounds this itself, so a stalled State
    // API costs the bookmark rather than the launch.
    try {
      await adapter.loadState();
    } catch (err) {
      console.warn('Tessera: resume state load failed', err);
    }
    if (this.#disposed) return null;

    // An LMS-supplied mastery score is the authoritative pass threshold for
    // this launch and overrides the manifest.
    const lmsMastery = adapter.getMasteryScore();
    if (lmsMastery !== null) {
      this.#config.scoring.passingScore = Number(
        (lmsMastery * 100).toPrecision(15),
      );
    }

    // The first page is gated on persistenceReady, so a malformed saved
    // document must cost the resume, not the course.
    try {
      const saved = adapter.getState();
      if (
        saved &&
        shouldRestore(saved, this.#fingerprint, this.#config.resume)
      ) {
        this.#restore(saved);
      }
    } catch (err) {
      console.error('Tessera: resume state could not be restored', err);
    }
    this.#persistenceReady = true;
    if (this.#persistPending) {
      this.#persistPending = false;
      this.#requestPersist();
    }

    // LMSes must never see the SCORM default ("unknown") on Terminate: SCORM
    // Cloud rolls that up to "completed"/"passed" during status rollup.
    adapter.setCompletionStatus(progress.reportedCompletionStatus);
    adapter.setSuccessStatus(progress.successStatus);
    adapter.commit();

    const { signal } = this.#listeners;
    window.addEventListener('pagehide', () => this.#onPagehide(), { signal });
    window.addEventListener('pageshow', (event) => this.#onPageshow(event), {
      signal,
    });

    // Courses with no `xapi:` config get null, which is what `useXAPI()` is
    // documented to return when nothing is wired.
    try {
      this.#xapiClient = await this.#buildXAPIClient();
    } catch (err) {
      console.warn('Tessera: xAPI client setup failed', err);
    }
    if (this.#disposed) return null;
    registerXAPIClient(this.#xapiClient);
    return null;
  }

  async exit(): Promise<void> {
    if (!this.canExit) return;
    this.#exitPhase = 'ending';
    const deadline = new Promise((resolve) =>
      setTimeout(resolve, EXIT_TIMEOUT_MS),
    );
    await Promise.race([this.#courseUnmounted, deadline]);
    await this.#xapiClient?.flush(deadline);
    if (!this.#endSession()) return;
    await this.#adapter.exit(deadline).catch((err) => {
      console.warn('Tessera: exit failed', err);
    });
    if (this.exitPhase === 'ended') return;
    this.#exitPhase = 'ended';
    if (!this.#adapter.returnToLMS()) window.close();
  }

  dispose(): void {
    this.#disposed = true;
    this.#destroyEffects();
    this.#listeners.abort();
    // A stale client from this session must not leak into a fresh one.
    registerXAPIClient(null);
  }

  #restore(saved: SavedState): void {
    const progress = this.#progress;
    progress.restoreFrom(saved);
    if (isRecord(saved.u)) {
      this.#userState = { ...this.#userState, ...saved.u };
    }
    this.#duration = new DurationTracker(saved.d);
    // After progress, so the bookmark's page is unlocked.
    this.#nav.goToPage(saved.b);

    this.#prevCompletionStatus = progress.reportedCompletionStatus;
    this.#prevSuccessStatus = progress.successStatus;
    const seededScore = progress.gradedScoreFinal
      ? progress.reportedScore
      : null;
    if (
      this.#adapter.seedLifecycle(
        progress.reportedCompletionStatus,
        progress.successStatus,
        seededScore,
      )
    ) {
      this.#prevReportedScore = seededScore;
    }
  }

  #savableUserState(): Record<string, unknown> {
    const u: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.#userState)) {
      try {
        JSON.stringify(value);
        u[key] = value;
      } catch (err) {
        if (this.#unsavableKeys.has(key)) continue;
        this.#unsavableKeys.add(key);
        console.warn(
          `Tessera: usePersistence('${key}') holds a value that is not JSON-serializable; it is left out of the save`,
          err,
        );
      }
    }
    return u;
  }

  #serialize(): SavedState {
    const u = this.#savableUserState();
    return {
      b: this.#nav.currentPageIndex,
      f: this.#fingerprint,
      d: this.#duration.totalSeconds,
      ...this.#progress.toSaved(),
      ...(Object.keys(u).length > 0 ? { u } : {}),
    };
  }

  // Microtask-batched: mutations within one tick collapse to one save and
  // one LMS commit.
  #requestPersist(): void {
    if (!this.#persistenceReady) {
      this.#persistPending = true;
      return;
    }
    if (this.#persistScheduled) return;
    this.#persistScheduled = true;
    queueMicrotask(() => {
      this.#persistScheduled = false;
      if (this.#exitPhase) return;
      this.#adapter.saveState(this.#serialize());
    });
  }

  #trackChanges(): void {
    const nav = this.#nav;
    const progress = this.#progress;
    const launchPageIndex = nav.currentPageIndex;
    const launchVersion = progress.version;
    let ran = false;
    // userState writes request a save from the store's setter instead.
    $effect(() => {
      const pageIndex = nav.currentPageIndex;
      const version = progress.version;
      if (!ran) {
        ran = true;
        if (pageIndex === launchPageIndex && version === launchVersion) return;
      }
      untrack(() => this.#requestPersist());
    });
  }

  #reportStatus(): void {
    const adapter = this.#adapter;
    const progress = this.#progress;

    $effect(() => {
      if (!this.#persistenceReady) return;
      if (!progress.gradedScoreFinal) return;

      const score = progress.reportedScore;
      if (score === this.#prevReportedScore) return;
      this.#prevReportedScore = score;

      untrack(() => {
        adapter.setScore(score);
        // Before the commit, so a verdict this score decides carries it and
        // xAPI/cmi5 send one statement rather than a Scored and a Passed.
        this.#prevSuccessStatus = progress.successStatus;
        adapter.setSuccessStatus(this.#prevSuccessStatus);
        adapter.setDuration(this.#duration.sessionSeconds);
        adapter.commit();
      });
    });

    $effect(() => {
      const status = progress.reportedCompletionStatus;
      if (!this.#persistenceReady) return;
      if (status === this.#prevCompletionStatus) return;
      this.#prevCompletionStatus = status;
      untrack(() => {
        adapter.setCompletionStatus(status);
        adapter.setDuration(this.#duration.sessionSeconds);
        adapter.commit();
      });
    });

    $effect(() => {
      const status = progress.successStatus;
      if (!this.#persistenceReady) return;
      if (status === this.#prevSuccessStatus) return;
      this.#prevSuccessStatus = status;
      untrack(() => {
        adapter.setSuccessStatus(status);
        adapter.commit();
      });
    });
  }

  // Dev-only, for `completion.mode: "manual"` without an opt-in trigger check:
  // catches the hook never being called or no completesOn page being reachable.
  #watchManualCompletion(): void {
    const { completion } = this.#config;
    if (
      !import.meta.env?.DEV ||
      completion.mode !== 'manual' ||
      completion.trigger !== undefined
    ) {
      return;
    }
    const progress = this.#progress;
    $effect(() => {
      if (
        !this.#persistenceReady ||
        this.#exitPhase ||
        progress.completionStatus !== 'incomplete'
      ) {
        return;
      }
      const watchdog = setTimeout(() => {
        console.warn(
          '[tessera] completion.mode is "manual" but the course has not completed after 60s. ' +
            'No page declared `pageConfig.completesOn: "view"` was reached, and no component called ' +
            '`useCompletion().markComplete()`. This is a misconfiguration; set `completion.trigger: "page"` ' +
            'in course.config.js to fail the build instead of waiting at runtime.',
        );
      }, 60_000);
      return () => clearTimeout(watchdog);
    });
  }

  #endSession(): boolean {
    if (this.#terminated) return false;
    this.#terminated = true;
    const adapter = this.#adapter;
    adapter.saveState(this.#serialize());
    adapter.setDuration(this.#duration.sessionSeconds);
    // Before terminate(), so SCORM commits the exit mode in the same flush.
    adapter.setExit(
      this.#progress.reportedCompletionStatus === 'complete'
        ? 'normal'
        : 'suspend',
    );
    adapter.commit();
    return true;
  }

  #onPagehide(): void {
    this.#endSession();
    if (this.#exitPhase === 'ending') this.#exitPhase = 'ended';
    this.#duration.pause();
    this.#xapiClient?.markUnloading();
    this.#adapter.terminate();
  }

  #onPageshow(event: PageTransitionEvent): void {
    if (!this.#terminated || !event.persisted) return;
    this.#xapiClient?.markRestored();
    if (this.#adapter.connected) {
      this.#exitPhase = 'ended';
      return;
    }
    this.#terminated = false;
    this.#duration.resume();
  }
}
