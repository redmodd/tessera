import { onTestFinished } from 'vitest';
import { CourseSession } from '../../src/runtime/course-session.svelte.js';
import { NavigationState } from '../../src/runtime/navigation.svelte.js';
import { ProgressState } from '../../src/runtime/progress.svelte.js';
import type { BaseAdapter } from '../../src/runtime/adapters/base.js';
import type { Manifest } from '../../src/plugin/manifest.js';
import type { CourseConfig } from '../../src/runtime/types.js';
import type { XAPIClient } from '../../src/runtime/xapi/client.js';
import {
  createConfig,
  createManifest,
  flush,
  stubAdapter,
} from '../helpers.js';

export interface SessionOptions {
  config?: CourseConfig;
  manifest?: Manifest;
  adapter?: BaseAdapter;
  buildXAPIClient?: () => Promise<XAPIClient | null>;
}

export function createSession({
  config = createConfig(),
  manifest = createManifest(2),
  adapter = stubAdapter(),
  buildXAPIClient = async () => null,
}: SessionOptions = {}) {
  const course = $state(config);
  const progress = new ProgressState(manifest, course);
  const nav = new NavigationState(manifest, progress, course);
  const session = new CourseSession({
    adapter,
    manifest,
    config: course,
    progress,
    nav,
    buildXAPIClient,
    courseUnmounted: Promise.resolve(),
  });
  onTestFinished(() => session.dispose());
  return { session, progress, nav, config: course };
}

export async function startSession(options: SessionOptions = {}) {
  const course = createSession(options);
  await course.session.start();
  await flush();
  return course;
}

export function recordingAdapter(overrides: Partial<BaseAdapter> = {}) {
  const calls: string[] = [];
  const adapter = stubAdapter({
    saveState: () => calls.push('saveState'),
    setDuration: (seconds) => calls.push(`setDuration:${seconds}`),
    setExit: (mode) => calls.push(`setExit:${mode}`),
    commit: () => calls.push('commit'),
    terminate: () => calls.push('terminate'),
    ...overrides,
  });
  return { adapter, calls };
}

export const EXIT_SEQUENCE = [
  'saveState',
  'setDuration:0',
  'setExit:suspend',
  'commit',
  'terminate',
];

export function pagehide() {
  window.dispatchEvent(new Event('pagehide'));
}

export function enterBfcache() {
  window.dispatchEvent(
    new PageTransitionEvent('pagehide', { persisted: true }),
  );
}

export function restoreFromBfcache() {
  window.dispatchEvent(
    new PageTransitionEvent('pageshow', { persisted: true }),
  );
}

export function bfcacheRoundTrip() {
  enterBfcache();
  restoreFromBfcache();
}
