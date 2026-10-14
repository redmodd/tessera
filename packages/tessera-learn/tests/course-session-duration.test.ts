// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import type { ProgressState } from '../src/runtime/progress.svelte.js';
import {
  cmi5Fetch,
  createConfig,
  createManifest,
  flush,
  postedStatements,
  setXAPILaunch,
  useFakeTimers,
} from './helpers.js';
import {
  createSession,
  pagehide,
  startSession,
} from './helpers/session.svelte.js';

const manifest = createManifest(1, { 0: { graded: true } });
const saved = { b: 0, v: [0], d: 100, f: structureFingerprint(manifest) };

function xapiLaunch() {
  setXAPILaunch();
  return new XAPIAdapter();
}

const quizCourse = () =>
  createConfig({ resume: 'auto', completion: { mode: 'quiz' } });

function stubLMS(state: object = saved) {
  const fetch = vi.fn(cmi5Fetch({ saved: state }));
  vi.stubGlobal('fetch', fetch);
  return () =>
    Object.fromEntries(
      postedStatements(fetch).map((s) => [
        s.verb.display['en-US'],
        s.result?.duration ?? null,
      ]),
    );
}

async function passAfter30sAndLeaveAfter50s(progress: ProgressState) {
  vi.advanceTimersByTime(30_000);
  progress.quizCompleted(0, 90);
  await flush();
  vi.advanceTimersByTime(20_000);
  pagehide();
  await flush();
}

describe('statement durations in a session resumed after 100 seconds', () => {
  it.each([
    ['after a restore', saved],
    ['when the course structure changed', { ...saved, f: 'stale' }],
  ])(
    'reports the time so far on Passed, Completed and Terminated %s',
    async (_, state) => {
      useFakeTimers({ toFake: ['Date'] });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const durations = stubLMS(state);
      const { progress } = await startSession({
        config: quizCourse(),
        manifest,
        adapter: xapiLaunch(),
      });

      await passAfter30sAndLeaveAfter50s(progress);

      expect(durations()).toMatchObject({
        passed: 'PT2M10S',
        completed: 'PT2M10S',
        terminated: 'PT2M30S',
      });
    },
  );

  it('reports the saved time on statements sent when the restore fails partway', async () => {
    useFakeTimers({ toFake: ['Date'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const durations = stubLMS({ ...saved, g: { 0: { s: 90 } } });
    const { session, nav } = createSession({
      config: quizCourse(),
      manifest,
      adapter: xapiLaunch(),
    });
    vi.spyOn(nav, 'goToPage').mockImplementation(() => {
      throw new Error('canAccess threw');
    });

    await session.start();
    await flush();

    expect(durations()).toMatchObject({
      passed: 'PT1M40S',
      completed: 'PT1M40S',
    });
  });
});
