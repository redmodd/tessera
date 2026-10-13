// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
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
import { pagehide, startSession } from './helpers/session.svelte.js';

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

describe('statement durations in a session resumed after 100 seconds', () => {
  it.each([
    ['xAPI', 'PT2M30S'],
    ['cmi5', 'PT50S'],
  ] as const)(
    '%s reports the time so far on Passed and Completed, and %s on Terminated',
    async (standard, terminated) => {
      useFakeTimers({ toFake: ['Date'] });
      const fetch = vi.fn(cmi5Fetch({ saved }));
      vi.stubGlobal('fetch', fetch);
      const { progress } = await startSession({
        config: createConfig({ resume: 'auto', completion: { mode: 'quiz' } }),
        manifest,
        adapter: launches[standard](),
      });

      vi.advanceTimersByTime(30_000);
      progress.quizCompleted(0, 90);
      await flush();
      vi.advanceTimersByTime(20_000);
      pagehide();
      await flush();

      const durations = Object.fromEntries(
        postedStatements(fetch).map((s) => [
          s.verb.display['en-US'],
          s.result?.duration,
        ]),
      );
      expect(durations).toMatchObject({
        passed: 'PT2M10S',
        completed: 'PT2M10S',
        terminated,
      });
    },
  );
});
