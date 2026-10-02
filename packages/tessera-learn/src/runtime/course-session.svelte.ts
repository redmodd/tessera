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
import type { SavedState } from './persistence.js';
import type { XAPIClient } from './xapi/client.js';

// The cmi5 auth token, LaunchData and Agent Profile fetches inside init()
// have no deadline of their own, and the first page waits on all three.
const INIT_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;

export type ExitPhase = 'ending' | 'ended';

export interface CourseSessionDeps {
  adapter: BaseAdapter;
  manifest: Manifest;
  /** A `$state` proxy, so the LMS mastery override re-derives every consumer. */
  config: CourseConfig;
  progress: ProgressState;
  nav: NavigationState;
  buildXAPIClient: () => Promise<XAPIClient | null>;
  /** Resolves once the course UI has unmounted, so the final save sees its last writes. */
  courseUnmounted: Promise<void>;
  onLeave: () => void;
}

export class CourseSession {
  #adapter: BaseAdapter;
  #config: CourseConfig;
  #progress: ProgressState;
  #nav: NavigationState;
  #buildXAPIClient: () => Promise<XAPIClient | null>;
  #courseUnmounted: Promise<void>;
  #onLeave: () => void;
  #fingerprint: string;

  #persistenceReady = $state(false);
  #launched = $state(false);
  #terminated = $state(false);
  #exitPhase = $state<ExitPhase | null>(null);
  #duration = new DurationTracker(0);
  #xapiClient: XAPIClient | null = null;

  // Each usePersistence call site namespaces under its own key. Saved to SavedState.u.
  #userState = $state<Record<string, unknown>>({});
  #unsavableKeys = new Set<string>();

  #persistScheduled = false;
  #persistPending = false;

  #prevReportedScore: number | null = null;
  #prevSuccessStatus = 'unknown';
  #prevCompletionStatus = 'incomplete';

  readonly userStateStore: UserStateStore = {
    get: (key) => (key in this.#userState ? this.#userState[key] : null),
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
    onLeave,
  }: CourseSessionDeps) {
    this.#adapter = adapter;
    this.#config = config;
    this.#progress = progress;
    this.#nav = nav;
    this.#buildXAPIClient = buildXAPIClient;
    this.#courseUnmounted = courseUnmounted;
    this.#onLeave = onLeave;
    this.#fingerprint = structureFingerprint(manifest);

    this.#trackChanges();
    this.#reportStatus();

    window.addEventListener('pagehide', this.#onPagehide);
    window.addEventListener('pageshow', this.#onPageshow);
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
      this.#launched &&
      !this.#terminated &&
      !this.#exitPhase
    );
  }

  /** Rejects when the adapter cannot connect: the learner can't continue regardless. */
  async start(): Promise<void> {
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
    } finally {
      this.#persistenceReady = true;
      if (this.#persistPending) {
        this.#persistPending = false;
        this.#requestPersist();
      }
    }

    // Courses with no `xapi:` config get null, which is what `useXAPI()` is
    // documented to return when nothing is wired.
    try {
      this.#xapiClient = await this.#buildXAPIClient();
    } catch (err) {
      console.warn('Tessera: xAPI client setup failed', err);
      this.#xapiClient = null;
    }
    registerXAPIClient(this.#xapiClient);

    // LMSes must never see the SCORM default ("unknown") on Terminate: SCORM
    // Cloud rolls that up to "completed"/"passed" during status rollup.
    adapter.setCompletionStatus(progress.reportedCompletionStatus);
    adapter.setSuccessStatus(progress.successStatus);
    adapter.commit();

    this.#launched = true;
  }

  async exit(): Promise<void> {
    if (!this.canExit) return;
    this.#leave('ending');
    const deadline = new Promise((resolve) =>
      setTimeout(resolve, EXIT_TIMEOUT_MS),
    );
    await Promise.race([this.#courseUnmounted, deadline]);
    await this.#xapiClient?.flush(deadline);
    if (!this.#endSession()) return;
    await this.#adapter.exit(deadline).catch((err) => {
      console.warn('Tessera: exit failed', err);
    });
    if (this.#exitPhase === 'ended') return;
    this.#exitPhase = 'ended';
    if (!this.#adapter.returnToLMS()) window.close();
  }

  dispose(): void {
    window.removeEventListener('pagehide', this.#onPagehide);
    window.removeEventListener('pageshow', this.#onPageshow);
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
        adapter.setSuccessStatus(progress.successStatus);
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

  #leave(phase: ExitPhase): void {
    this.#exitPhase = phase;
    this.#onLeave();
  }

  #onPagehide = (): void => {
    if (!this.#launched) return;
    this.#endSession();
    if (this.#exitPhase === 'ending') this.#exitPhase = 'ended';
    this.#duration.pause();
    this.#xapiClient?.markUnloading();
    this.#adapter.terminate();
  };

  #onPageshow = (event: PageTransitionEvent): void => {
    if (!this.#terminated || !event.persisted) return;
    this.#xapiClient?.markRestored();
    if (this.#adapter.connected) {
      this.#leave('ended');
      return;
    }
    this.#terminated = false;
    this.#duration.resume();
  };
}
