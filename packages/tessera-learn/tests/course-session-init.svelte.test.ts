// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import type { SavedState } from '../src/runtime/persistence.js';
import type { XAPIClient } from '../src/runtime/xapi/client.js';
import {
  createConfig,
  createManifest,
  stubAdapter,
  useFakeTimers,
} from './helpers.js';
import { createSession } from './helpers/session.svelte.js';

function startWith(overrides: Partial<BaseAdapter>) {
  const { session } = createSession({
    config: createConfig({ resume: 'auto' }),
    manifest: createManifest(1),
    adapter: stubAdapter(overrides),
  });
  return { session, started: session.start() };
}

// The first page is held until adapter.init() resolves, and the LMS handshake
// it performs has no deadline of its own.
describe('CourseSession bounds adapter.init()', () => {
  it('resolves with the timeout when init never resolves', async () => {
    useFakeTimers();
    const { session, started } = startWith({
      init: () => new Promise(() => {}),
    });

    await vi.advanceTimersByTimeAsync(15_000);
    expect((await started)?.message).toBe('adapter init timed out');
    expect(session.persistenceReady).toBe(false);
  });

  it('resolves with the error when init fails', async () => {
    const { started } = startWith({
      init: async () => {
        throw new Error('bad launch');
      },
    });

    expect((await started)?.message).toBe('bad launch');
  });

  it('rejects for a failure after init', async () => {
    const { started } = startWith({
      commit: () => {
        throw new Error('commit failed');
      },
    });

    await expect(started).rejects.toThrow('commit failed');
  });

  it('starts when init resolves inside the deadline', async () => {
    useFakeTimers();
    const { session, started } = startWith({
      init: () => new Promise((resolve) => setTimeout(resolve, 100)),
    });

    await vi.advanceTimersByTimeAsync(20_000);
    await started;
    expect(session.persistenceReady).toBe(true);
  });

  it('starts when loadState rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session, started } = startWith({
      loadState: async () => {
        throw new Error('LRS unreachable');
      },
    });

    await started;
    expect(session.persistenceReady).toBe(true);
  });

  it('starts when the saved state is malformed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session, started } = startWith({
      getState: () => ({ d: 0 }) as SavedState,
    });

    await started;
    expect(session.persistenceReady).toBe(true);
  });
});

describe('CourseSession disposed while starting', () => {
  it.each([
    ['adapter init', 'init'],
    ['the xAPI client build', 'build'],
  ] as const)(
    'registers no xAPI client and ends no session when disposed during %s',
    async (_, phase) => {
      const { useXAPI } = await import('../src/runtime/xapi/registry.js');
      const terminate = vi.fn();
      const init = Promise.withResolvers<void>();
      const build = Promise.withResolvers<XAPIClient | null>();
      const { session } = createSession({
        adapter: stubAdapter({
          init: () => (phase === 'init' ? init.promise : Promise.resolve()),
          terminate,
        }),
        buildXAPIClient: () => build.promise,
      });
      const started = session.start();
      if (phase === 'build') {
        await vi.waitFor(() => expect(session.persistenceReady).toBe(true));
      }

      session.dispose();
      init.resolve();
      build.resolve({} as XAPIClient);
      await started;
      window.dispatchEvent(new Event('pagehide'));

      expect(useXAPI()).toBeNull();
      expect(terminate).not.toHaveBeenCalled();
    },
  );
});
