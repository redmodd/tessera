// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import {
  createConfig,
  createManifest,
  flush,
  postedStatements,
  respond,
  setXAPILaunch,
  stubAdapter,
} from './helpers.js';
import { createSession } from './helpers/session.svelte.js';

async function start(
  adapter: BaseAdapter,
  manifest = createManifest(1, { 0: { graded: true } }),
) {
  const { session, progress } = createSession({
    config: createConfig({
      resume: 'auto',
      completion: { mode: 'quiz' },
      export: { standard: 'xapi' },
    }),
    manifest,
    adapter,
  });
  await session.start();
  await flush();
  return progress;
}

describe('a graded submit that decides the verdict', () => {
  it('reports the score on the verdict instead of a statement of its own', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) =>
      url.includes('/statements') && init?.method === 'POST'
        ? respond(200, '[]')
        : respond(404),
    );
    vi.stubGlobal('fetch', fetch);
    setXAPILaunch({ registration: '2d8b1e1e-0000-4000-8000-000000000000' });
    const verbs = (): string[] =>
      postedStatements(fetch).map((s) => s.verb.display['en-US']);

    const progress = await start(new XAPIAdapter());
    await vi.waitFor(() => expect(verbs()).toContain('initialized'));
    fetch.mockClear();

    progress.quizCompleted(0, 90);

    await vi.waitFor(() => expect(verbs()).toContain('passed'));
    await flush();

    expect(verbs()).not.toContain('scored');
  });

  it('sends the verdict once, not again from the success effect', async () => {
    const setSuccessStatus = vi.fn();
    const progress = await start(stubAdapter({ setSuccessStatus }));

    progress.quizCompleted(0, 90);
    await flush();

    expect(setSuccessStatus.mock.calls.map(([status]) => status)).toEqual([
      'unknown',
      'passed',
    ]);
  });

  it('holds the completion a later optional page would take back', async () => {
    const setCompletionStatus = vi.fn();
    const setExit = vi.fn();
    const saveState = vi.fn();
    const progress = await start(
      stubAdapter({ setCompletionStatus, setExit, saveState }),
      createManifest(
        2,
        { 0: { graded: true }, 1: { graded: true } },
        { 1: { required: false } },
      ),
    );

    progress.quizCompleted(0, 90);
    await flush();

    progress.quizCompleted(1, 0);
    await flush();

    expect(progress.completionStatus).toBe('incomplete');
    expect(setCompletionStatus.mock.calls.map(([status]) => status)).toEqual([
      'incomplete',
      'complete',
    ]);

    window.dispatchEvent(new Event('pagehide'));

    expect(setExit).toHaveBeenCalledWith('normal');
    expect(saveState.mock.lastCall![0]).toMatchObject({ k: 1 });
  });
});
