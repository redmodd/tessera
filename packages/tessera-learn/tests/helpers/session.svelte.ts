import { onTestFinished } from 'vitest';
import { CourseSession } from '../../src/runtime/course-session.svelte.js';
import { NavigationState } from '../../src/runtime/navigation.svelte.js';
import { ProgressState } from '../../src/runtime/progress.svelte.js';
import type { BaseAdapter } from '../../src/runtime/adapters/base.js';
import type { Manifest } from '../../src/plugin/manifest.js';
import type { CourseConfig } from '../../src/runtime/types.js';
import type { XAPIClient } from '../../src/runtime/xapi/client.js';
import { createConfig, createManifest, stubAdapter } from '../helpers.js';

export type XAPIClientStub = Pick<
  XAPIClient,
  'markUnloading' | 'markRestored' | 'flush'
>;

export function createSession({
  config = createConfig(),
  manifest = createManifest(2),
  adapter = stubAdapter(),
  xapiClient = null,
  onLeave = () => {},
}: {
  config?: CourseConfig;
  manifest?: Manifest;
  adapter?: BaseAdapter;
  xapiClient?: XAPIClientStub | null;
  onLeave?: () => void;
} = {}) {
  const course = $state(config);
  const progress = new ProgressState(manifest, course);
  const nav = new NavigationState(manifest, progress, course);
  let session!: CourseSession;
  const destroy = $effect.root(() => {
    session = new CourseSession({
      adapter,
      manifest,
      config: course,
      progress,
      nav,
      buildXAPIClient: async () => xapiClient as XAPIClient | null,
      courseUnmounted: Promise.resolve(),
      onLeave,
    });
  });
  onTestFinished(() => {
    destroy();
    session.dispose();
  });
  return { session, progress, nav, config: course };
}
