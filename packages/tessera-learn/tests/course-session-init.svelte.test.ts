// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import type { SavedState } from '../src/runtime/persistence.js';
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
  it('rejects when init never resolves', async () => {
    useFakeTimers();
    const { session, started } = startWith({
      init: () => new Promise(() => {}),
    });
    const rejected = expect(started).rejects.toThrow('adapter init timed out');

    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(session.persistenceReady).toBe(false);
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
