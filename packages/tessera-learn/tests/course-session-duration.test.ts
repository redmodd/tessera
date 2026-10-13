// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import type { ProgressState } from '../src/runtime/progress.svelte.js';
import type { CourseConfig } from '../src/runtime/types.js';
import {
  CMI5_LAUNCH,
  cmi5Fetch,
  createConfig,
  createManifest,
  flush,
  postedStatements,
  setLaunchParams,
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

const launches = {
  xAPI: () => {
    setXAPILaunch();
    return new XAPIAdapter();
  },
  cmi5: () => {
    setLaunchParams(CMI5_LAUNCH);
    return new CMI5Adapter();
  },
};

const quizCourse = (resume: CourseConfig['resume'] = 'auto') =>
  createConfig({ resume, completion: { mode: 'quiz' } });

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
    ['xAPI', 'PT2M30S'],
    ['cmi5', 'PT50S'],
  ] as const)(
    '%s reports the time so far on Passed and Completed, and %s on Terminated',
    async (standard, terminated) => {
      useFakeTimers({ toFake: ['Date'] });
      const durations = stubLMS();
      const { progress } = await startSession({
        config: quizCourse(),
        manifest,
        adapter: launches[standard](),
      });

      await passAfter30sAndLeaveAfter50s(progress);

      expect(durations()).toMatchObject({
        passed: 'PT2M10S',
        completed: 'PT2M10S',
        terminated,
      });
    },
  );

  it.each([
    ['resume is off', saved, 'never'],
    ['the course structure changed', { ...saved, f: 'stale' }, 'auto'],
  ] as const)(
    'keeps counting from the saved time when %s',
    async (_, state, resume) => {
      useFakeTimers({ toFake: ['Date'] });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const durations = stubLMS(state);
      const { progress } = await startSession({
        config: quizCourse(resume),
        manifest,
        adapter: launches.xAPI(),
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
      adapter: launches.xAPI(),
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
