// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockInstance,
} from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import type { XAPIClient } from '../src/runtime/xapi/client.js';
import type { CourseSession } from '../src/runtime/course-session.svelte.js';
import { flush, manualConfig, stubAdapter, useFakeTimers } from './helpers.js';
import {
  bfcacheRoundTrip,
  buildXAPIStub,
  createSession,
  enterBfcache,
  EXIT_SEQUENCE,
  pagehide,
  recordingAdapter,
  restoreFromBfcache,
  startSession,
} from './helpers/session.svelte.js';

let close: MockInstance<typeof window.close>;

beforeEach(() => {
  close = vi.spyOn(window, 'close').mockImplementation(() => {});
});

describe('ending a CourseSession', () => {
  it('offers no exit until the session starts', async () => {
    const init = Promise.withResolvers<void>();
    const { session } = createSession({
      adapter: stubAdapter({ init: () => init.promise }),
    });
    const started = session.start();
    expect(session.canExit).toBe(false);

    init.resolve();
    await started;

    expect(session.canExit).toBe(true);
  });

  it('ends the session on exit', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session } = await startSession({ adapter });
    const launched = calls.length;

    await session.exit();

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(session.exitPhase).toBe('ended');
    expect(close).toHaveBeenCalled();
  });

  it('stops saving once the session has ended', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session } = await startSession({ adapter });
    await session.exit();
    const exited = calls.length;

    session.userStateStore.set('late-note', 'written after exit');
    await flush();

    expect(calls.slice(exited)).toEqual([]);
  });

  it('stops saving once disposed', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session, progress } = await startSession({ adapter });
    session.dispose();
    const disposed = calls.length;

    progress.markVisited(1);
    await flush();

    expect(calls.slice(disposed)).toEqual([]);
  });

  it('ends the session on pagehide while the xAPI client is still building', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session } = createSession({
      adapter,
      buildXAPIClient: () => new Promise(() => {}),
    });
    void session.start();
    await vi.waitFor(() => expect(session.persistenceReady).toBe(true));

    pagehide();

    expect(calls.at(-1)).toBe('terminate');
  });

  it.each([
    ['exit', (session: CourseSession) => session.exit()],
    ['pagehide', pagehide],
  ])(
    'registers no xAPI client once the session ends on %s during the build',
    async (_, leave) => {
      const { useXAPI } = await import('../src/runtime/xapi/registry.js');
      const build = Promise.withResolvers<XAPIClient | null>();
      const { session } = createSession({
        adapter: recordingAdapter().adapter,
        buildXAPIClient: () => build.promise,
      });
      const started = session.start();
      await vi.waitFor(() => expect(session.persistenceReady).toBe(true));

      await leave(session);
      build.resolve(await buildXAPIStub()());
      await started;

      expect(useXAPI()).toBeNull();
    },
  );

  it('registers the xAPI client built while the page was in the back/forward cache', async () => {
    const { useXAPI } = await import('../src/runtime/xapi/registry.js');
    const build = Promise.withResolvers<XAPIClient | null>();
    const { session } = createSession({
      adapter: recordingAdapter({ connected: false }).adapter,
      buildXAPIClient: () => build.promise,
    });
    const started = session.start();
    await vi.waitFor(() => expect(session.persistenceReady).toBe(true));

    enterBfcache();
    const client = await buildXAPIStub()();
    build.resolve(client);
    await started;
    restoreFromBfcache();

    expect(useXAPI()).toBe(client);
  });

  it('leaves a value that is not JSON-serializable out of the save', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saved: SavedState[] = [];
    const { adapter } = recordingAdapter({
      saveState: (state) => saved.push(state),
    });
    const { session } = await startSession({ adapter });

    session.userStateStore.set('note', 'kept');
    session.userStateStore.set('big', 1n);
    await flush();
    await session.exit();

    expect(saved.at(-2)!.u).toEqual({ note: 'kept' });
    expect(saved.at(-1)!.u).toEqual({ note: 'kept' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "Tessera: usePersistence('big') holds a value that is not JSON-serializable; it is left out of the save",
      expect.any(TypeError),
    );
  });

  it('exits normally once the course is complete', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session, progress } = await startSession({
      adapter,
      config: manualConfig(),
    });
    progress.markCompleteManually();

    await session.exit();

    expect(calls).toContain('setExit:normal');
  });

  it('terminates on pagehide while the exit is still saving', async () => {
    const { adapter, calls } = recordingAdapter({
      exit: () => new Promise<void>(() => {}),
    });
    const { session } = await startSession({ adapter });
    const launched = calls.length;

    void session.exit();
    expect(session.exitPhase).toBe('ending');
    pagehide();

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(session.exitPhase).toBe('ended');
  });

  it('ends the session when the exit fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = recordingAdapter({
      exit: async () => {
        throw new Error('boom');
      },
    });
    const { session } = await startSession({ adapter });

    await session.exit();

    expect(session.exitPhase).toBe('ended');
    expect(warn).toHaveBeenCalledWith(
      'Tessera: exit failed',
      expect.any(Error),
    );
    expect(close).toHaveBeenCalled();
  });

  it('terminates without exiting on pagehide', async () => {
    const exit = vi.fn();
    const { adapter, calls } = recordingAdapter({ exit });
    await startSession({ adapter });
    const launched = calls.length;

    pagehide();

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(exit).not.toHaveBeenCalled();
  });

  it("waits for the course's xAPI destinations before ending the session", async () => {
    const drained = Promise.withResolvers<void>();
    const flushXAPI = vi.fn(() => drained.promise);
    const { adapter, calls } = recordingAdapter();
    const { session } = await startSession({
      adapter,
      buildXAPIClient: buildXAPIStub({ flush: flushXAPI }),
    });
    const launched = calls.length;

    const exiting = session.exit();
    await vi.waitFor(() => expect(flushXAPI).toHaveBeenCalled());
    expect(calls.slice(launched)).toEqual([]);

    drained.resolve();
    await exiting;
    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
  });

  it('bounds the xAPI flush and the adapter exit by one deadline', async () => {
    const flushXAPI = vi.fn(async (_deadline: Promise<unknown>) => {});
    const exit = vi.fn(async () => {});
    const { adapter } = recordingAdapter({ exit });
    const { session } = await startSession({
      adapter,
      buildXAPIClient: buildXAPIStub({ flush: flushXAPI }),
    });

    await session.exit();

    expect(exit).toHaveBeenCalledWith(flushXAPI.mock.calls[0][0]);
  });

  it('switches xAPI sends to keepalive on pagehide but not on exit', async () => {
    const markUnloading = vi.fn();
    const { adapter } = recordingAdapter();
    const { session } = await startSession({
      adapter,
      buildXAPIClient: buildXAPIStub({ markUnloading }),
    });

    await session.exit();
    expect(markUnloading).not.toHaveBeenCalled();

    pagehide();
    expect(markUnloading).toHaveBeenCalled();
  });

  it('withdraws the exit once pagehide ends the session', async () => {
    const { session } = await startSession({
      adapter: recordingAdapter().adapter,
    });
    expect(session.canExit).toBe(true);

    pagehide();

    expect(session.canExit).toBe(false);
  });

  it('ends a session restored from the back/forward cache after pagehide', async () => {
    const { adapter, calls } = recordingAdapter();
    const { session } = await startSession({ adapter });
    enterBfcache();
    const hidden = calls.length;

    restoreFromBfcache();
    await flush();

    expect(session.exitPhase).toBe('ended');
    expect(calls.slice(hidden)).toEqual([]);
  });

  it('leaves the window open when a back/forward cache restore interrupts the exit', async () => {
    const drained = Promise.withResolvers<void>();
    const exit = vi.fn();
    const { adapter } = recordingAdapter({ exit });
    const { session } = await startSession({
      adapter,
      buildXAPIClient: buildXAPIStub({ flush: () => drained.promise }),
    });

    const exiting = session.exit();
    bfcacheRoundTrip();
    drained.resolve();
    await exiting;

    expect(session.exitPhase).toBe('ended');
    expect(exit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ['after', false],
    ['before', true],
  ])(
    'stays on a page restored from the back/forward cache when the adapter exit settles %s the restore',
    async (_, settlesFirst) => {
      const exiting = Promise.withResolvers<void>();
      const exit = vi.fn(() => exiting.promise);
      const returnToLMS = vi.fn(() => true);
      const { adapter } = recordingAdapter({ exit, returnToLMS });
      const { session } = await startSession({ adapter });

      void session.exit();
      await vi.waitFor(() => expect(exit).toHaveBeenCalled());
      enterBfcache();
      if (settlesFirst) {
        exiting.resolve();
        await flush();
      }
      restoreFromBfcache();
      exiting.resolve();
      await flush();

      expect(session.exitPhase).toBe('ended');
      expect(returnToLMS).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    },
  );

  it('keeps running a course the learner left and restored while it was launching', async () => {
    const init = Promise.withResolvers<void>();
    const { adapter, calls } = recordingAdapter({ init: () => init.promise });
    const { session } = createSession({ adapter });
    const started = session.start();

    enterBfcache();
    init.resolve();
    await started;
    restoreFromBfcache();
    await flush();

    expect(session.exitPhase).toBeNull();
    expect(session.canExit).toBe(true);
    expect(calls).not.toContain('terminate');
  });

  it('keeps a course restored from the back/forward cache running without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    const { session, nav } = await startSession({ adapter });
    bfcacheRoundTrip();
    const restored = calls.length;

    nav.goToPage(1);
    await flush();

    expect(session.exitPhase).toBeNull();
    expect(calls.slice(restored)).toContain('saveState');
  });

  it('ends the session again on the next pagehide after a restore without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    await startSession({ adapter });
    bfcacheRoundTrip();
    const restored = calls.length;

    pagehide();

    expect(calls.slice(restored)).toEqual(EXIT_SEQUENCE);
  });

  it('leaves time in the back/forward cache out of the saved duration', async () => {
    useFakeTimers({ toFake: ['Date'] });
    const saved: SavedState[] = [];
    const { adapter } = recordingAdapter({
      connected: false,
      saveState: (state) => saved.push(state),
    });
    await startSession({ adapter });

    vi.advanceTimersByTime(10_000);
    enterBfcache();
    vi.advanceTimersByTime(3 * 60 * 60_000);
    restoreFromBfcache();
    vi.advanceTimersByTime(5_000);
    pagehide();

    expect(saved.at(-1)!.d).toBe(15);
  });

  it.each([
    ['under an LMS', true],
    ['without an LMS', false],
  ])(
    'takes xAPI sends out of keepalive when a course %s is restored',
    async (_, connected) => {
      const markRestored = vi.fn();
      const { adapter } = recordingAdapter({ connected });
      await startSession({
        adapter,
        buildXAPIClient: buildXAPIStub({ markRestored }),
      });

      bfcacheRoundTrip();

      expect(markRestored).toHaveBeenCalled();
    },
  );

  it('leaves the window open when the adapter returns the learner to the LMS', async () => {
    const returnToLMS = vi.fn(() => true);
    const { adapter } = recordingAdapter({ returnToLMS });
    const { session } = await startSession({ adapter });

    await session.exit();

    expect(session.exitPhase).toBe('ended');
    expect(returnToLMS).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('ignores exit() without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    const { session } = await startSession({ adapter });
    const launched = calls.length;

    await session.exit();

    expect(calls.slice(launched)).toEqual([]);
    expect(session.exitPhase).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps saving after pagehide without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    const { nav } = await startSession({ adapter });
    pagehide();
    const hidden = calls.length;

    nav.goToPage(1);
    await flush();

    expect(calls.slice(hidden)).toContain('saveState');
  });
});
