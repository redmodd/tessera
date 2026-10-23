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
import {
  jsonSize,
  type CompletionStatus,
  type ExitMode,
  type SavedState,
  type SuccessStatus,
} from './persistence.js';
import type { XAPIClient } from './xapi/client.js';

// The cmi5 auth token, LaunchData and Agent Profile fetches inside init()
// have no deadline of their own, and the first page waits on all three.
const INIT_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;
// usePersistence can save on every keystroke, and a commit is often a server
// round trip.
const COMMIT_INTERVAL_MS = 10_000;

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
  #lifetime = new AbortController();

  #persistenceReady = $state(false);
  #launched = $state(false);
  #terminated = $state(false);
  #exitPhase = $state<ExitPhase | null>(null);
  #duration = new DurationTracker();
  #xapiClient: XAPIClient | null = null;

  // Each usePersistence call site namespaces under its own key. Saved to SavedState.u.
  #userState = $state<Record<string, unknown>>({});
  #unsavableKeys = new Set<string>();
  #answersTrimmedWarned = false;

  #persistScheduled = false;
  #persistPending = false;
  #commitTimer: ReturnType<typeof setTimeout> | undefined;
  #lastCommitAt = -Infinity;

  #prevReportedScore: number | null = null;
  // Undefined until the launch report, so it sends every status.
  #prevSuccessStatus: SuccessStatus | undefined;
  #prevVerdictFinal: boolean | undefined;
  #prevCompletionStatus: CompletionStatus | undefined;

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
      this.#launched &&
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
    if (this.#lifetime.signal.aborted) return null;

    const { signal } = this.#lifetime;
    window.addEventListener('pagehide', this.#onPagehide, { signal });
    window.addEventListener('pageshow', this.#onPageshow, { signal });
    document.addEventListener('visibilitychange', this.#onVisibilityChange, {
      signal,
    });

    // Separate from init(): the adapter bounds this itself, so a stalled State
    // API costs the bookmark rather than the launch.
    try {
      await adapter.loadState();
    } catch (err) {
      console.warn('Tessera: resume state load failed', err);
    }
    if (this.#lifetime.signal.aborted || this.#terminated) return null;

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
      if (saved) {
        // Before the restore, so a launch that starts fresh keeps the time.
        this.#duration.setPrevious(saved.d);
        if (shouldRestore(saved, this.#fingerprint, this.#config.resume)) {
          this.#restore(saved);
        }
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
    // Cloud rolls that up to "completed"/"passed" during status rollup. Sent
    // here rather than left to the effect, so a failure rejects start().
    this.#reportChanges();

    // Courses with no `xapi:` config get null, which is what `useXAPI()` is
    // documented to return when nothing is wired.
    try {
      this.#xapiClient = await this.#buildXAPIClient();
    } catch (err) {
      console.warn('Tessera: xAPI client setup failed', err);
    }
    if (this.#lifetime.signal.aborted || this.#terminated) return null;
    registerXAPIClient(this.#xapiClient);
    this.#launched = true;
    return null;
  }

  async exit(): Promise<void> {
    if (!this.canExit) return;
    this.#exitPhase = 'ending';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(resolve, EXIT_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.#courseUnmounted, deadline]);
      await this.#xapiClient?.flush(deadline);
      if (!this.#endSession()) return;
      await this.#adapter.exit(deadline).catch((err) => {
        console.warn('Tessera: exit failed', err);
      });
    } finally {
      clearTimeout(timer);
    }
    if (this.exitPhase === 'ended') return;
    this.#exitPhase = 'ended';
    if (!this.#adapter.returnToLMS()) window.close();
  }

  dispose(): void {
    this.#lifetime.abort();
    this.#clearCommitTimer();
    this.#destroyEffects();
    // A stale client from this session must not leak into a fresh one.
    registerXAPIClient(null);
  }

  #restore(saved: SavedState): void {
    const progress = this.#progress;
    progress.restoreFrom(saved);
    if (isRecord(saved.u)) {
      this.#userState = { ...this.#userState, ...saved.u };
    }
    // After progress, so the bookmark's page is unlocked.
    this.#nav.goToPage(saved.b);

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
    const d = this.#duration.totalSeconds;
    const withAnswers = (budget: number): SavedState => ({
      b: this.#nav.currentPageIndex,
      f: this.#fingerprint,
      d,
      ...this.#progress.toSaved(budget),
      ...(Object.keys(u).length > 0 ? { u } : {}),
    });
    const state = withAnswers(Infinity);
    const limit = this.#adapter.stateLimit;
    if (limit === Infinity) return state;
    const size = jsonSize(state);
    if (size <= limit) return state;
    const bareSize = jsonSize(withAnswers(0));
    // No answers to leave out: the adapter warns about the overflow itself.
    if (bareSize === size) return state;
    if (!this.#answersTrimmedWarned) {
      this.#answersTrimmedWarned = true;
      console.warn(
        `Tessera: the saved state is over the ${limit}-byte limit, so question ` +
          `answers are left out of it until it fits. Those questions come back ` +
          `scored, without the answer shown.`,
      );
    }
    return withAnswers(limit - bareSize);
  }

  // Microtask-batched: mutations within one tick collapse to one save.
  #requestPersist(): void {
    if (!this.#persistenceReady) {
      this.#persistPending = true;
      return;
    }
    if (this.#persistScheduled) return;
    this.#persistScheduled = true;
    queueMicrotask(() => {
      if (this.#flushSave()) this.#scheduleCommit();
    });
  }

  // A status report runs this first, so one commit carries the save too.
  #flushSave(): boolean {
    if (!this.#persistScheduled) return false;
    this.#persistScheduled = false;
    if (this.#exitPhase || this.#lifetime.signal.aborted) return false;
    this.#adapter.saveState(this.#serialize());
    return true;
  }

  // A SCORM LMS may keep only committed values, and a page killed without
  // pagehide never reaches the end-of-session commit.
  #scheduleCommit(): void {
    if (this.#commitTimer !== undefined) return;
    const wait = this.#lastCommitAt + COMMIT_INTERVAL_MS - performance.now();
    if (wait > 0) {
      this.#commitTimer = setTimeout(this.#commitProgress, wait);
    } else {
      this.#commitProgress();
    }
  }

  #commitProgress = (): void => {
    if (
      !this.#persistenceReady ||
      this.#terminated ||
      this.#exitPhase ||
      this.#lifetime.signal.aborted
    ) {
      this.#clearCommitTimer();
      return;
    }
    this.#reportDuration();
    this.#commit();
  };

  #commit(): void {
    this.#clearCommitTimer();
    this.#lastCommitAt = performance.now();
    this.#adapter.commit();
  }

  #clearCommitTimer(): void {
    clearTimeout(this.#commitTimer);
    this.#commitTimer = undefined;
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

  #reportDuration(): void {
    this.#adapter.setDuration(
      this.#duration.sessionSeconds,
      this.#duration.totalSeconds,
    );
  }

  #report(setStatus: () => void): void {
    untrack(() => {
      this.#reportDuration();
      this.#flushSave();
      setStatus();
      this.#commit();
    });
  }

  #reportChanges(): void {
    const adapter = this.#adapter;
    const progress = this.#progress;
    const score = progress.gradedScoreFinal ? progress.reportedScore : null;
    const completion = progress.reportedCompletionStatus;
    const success = progress.successStatus;
    const final = progress.verdictFinal;

    const scoreChanged = score !== null && score !== this.#prevReportedScore;
    const completionChanged = completion !== this.#prevCompletionStatus;
    const successChanged =
      success !== this.#prevSuccessStatus || final !== this.#prevVerdictFinal;
    if (!scoreChanged && !completionChanged && !successChanged) return;

    this.#report(() => {
      if (scoreChanged) {
        this.#prevReportedScore = score;
        adapter.setScore(score);
      }
      if (completionChanged) {
        this.#prevCompletionStatus = completion;
        adapter.setCompletionStatus(completion);
      }
      // With every score, so a verdict the score decides carries it and
      // xAPI/cmi5 send one statement rather than a Scored and a Passed.
      if (scoreChanged || successChanged) {
        this.#prevSuccessStatus = success;
        this.#prevVerdictFinal = final;
        adapter.setSuccessStatus(success, final);
      }
      // Before the session ends too: a page killed without pagehide never
      // reaches #endSession, and the LMS would treat the default as normal.
      adapter.setExit(this.#exitMode());
    });
  }

  #reportStatus(): void {
    // One effect, so what changes in one tick reaches the LMS in one commit:
    // SCORM 1.2 would otherwise show `completed` before `failed`.
    $effect(() => {
      if (this.#persistenceReady) this.#reportChanges();
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
    registerXAPIClient(null);
    const adapter = this.#adapter;
    this.#reportDuration();
    if (!this.#persistenceReady) return true;
    adapter.saveState(this.#serialize());
    // Before terminate(), so SCORM commits the exit mode in the same flush.
    adapter.setExit(this.#exitMode());
    this.#commit();
    return true;
  }

  #exitMode(): ExitMode {
    return this.#progress.attemptOver ? 'normal' : 'suspend';
  }

  #onPagehide = (): void => {
    this.#endSession();
    if (this.#exitPhase === 'ending') this.#exitPhase = 'ended';
    this.#duration.pause();
    this.#xapiClient?.markUnloading();
    this.#adapter.terminate();
  };

  // iOS Safari can kill a backgrounded page without firing pagehide.
  #onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.#commitProgress();
  };

  #onPageshow = (event: PageTransitionEvent): void => {
    if (!this.#terminated || !event.persisted) return;
    this.#xapiClient?.markRestored();
    if (this.#adapter.connected) {
      this.#exitPhase = 'ended';
      return;
    }
    this.#terminated = false;
    this.#duration.resume();
    registerXAPIClient(this.#xapiClient);
  };
}
