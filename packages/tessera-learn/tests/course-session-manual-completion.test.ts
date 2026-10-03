// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import type { CourseConfig } from '../src/runtime/types.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import type { CourseSession } from '../src/runtime/course-session.svelte.js';
import {
  createConfig,
  createManifest,
  flush,
  manualConfig,
  stubAdapter,
  useFakeTimers,
} from './helpers.js';
import {
  bfcacheRoundTrip,
  createSession,
  startSession,
} from './helpers/session.svelte.js';

const manifest = createManifest(2);

async function start(
  completion: CourseConfig['completion'],
  saved: SavedState | null = null,
) {
  const setCompletionStatus = vi.fn();
  const setSuccessStatus = vi.fn();
  const { progress } = await startSession({
    config: createConfig({ resume: 'auto', completion }),
    manifest,
    adapter: stubAdapter({
      getState: () => saved,
      setCompletionStatus,
      setSuccessStatus,
    }),
  });
  return { progress, setCompletionStatus, setSuccessStatus };
}

describe('manual completion in a CourseSession', () => {
  it('restores a manual completion saved as m: 1', async () => {
    const { progress } = await start({ mode: 'manual' }, {
      b: 0,
      v: [0],
      d: 0,
      f: structureFingerprint(manifest),
      m: 1,
    } as SavedState);

    expect(progress.toSaved().m).toBe(1);
    expect(progress.completionStatus).toBe('complete');
  });

  it('reports the requireSuccessStatus verdict with the manual completion', async () => {
    const { progress, setCompletionStatus, setSuccessStatus } = await start({
      mode: 'manual',
      requireSuccessStatus: 'passed',
    });

    progress.markCompleteManually();
    await flush();

    expect(setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(setSuccessStatus).toHaveBeenCalledWith('passed');
  });

  it('reports no verdict for a manual completion without requireSuccessStatus', async () => {
    const { progress, setCompletionStatus, setSuccessStatus } = await start({
      mode: 'manual',
    });

    progress.markCompleteManually();
    await flush();

    expect(setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('passed');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('failed');
  });
});

describe('the manual-completion watchdog', () => {
  function watch(init?: Promise<void>) {
    useFakeTimers({ shouldAdvanceTime: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const course = createSession({
      config: manualConfig(),
      adapter: stubAdapter(init && { init: () => init }),
    });
    return { ...course, warn };
  }

  it('warns when a manual course has not completed after 60s', async () => {
    const { session, warn } = watch();
    await session.start();
    await flush();

    vi.advanceTimersByTime(60_000);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('has not completed after 60s'),
    );
  });

  it.each([
    ['the exit', (session: CourseSession) => session.exit()],
    ['a back/forward cache restore', bfcacheRoundTrip],
  ])('stops after %s', async (_, leave) => {
    const { session, warn } = watch();
    await session.start();
    await flush();

    await leave(session);
    await flush();
    vi.advanceTimersByTime(60_000);

    expect(warn).not.toHaveBeenCalled();
  });

  it('waits for the session to start', async () => {
    const { session, warn } = watch(new Promise(() => {}));
    void session.start();
    await flush();

    vi.advanceTimersByTime(60_000);

    expect(warn).not.toHaveBeenCalled();
  });
});
