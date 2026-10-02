// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';

describe('App wires the course into its session', () => {
  it('saves what the layout writes through usePersistence', async () => {
    const saveState = vi.fn();
    await mountApp({
      config: createConfig(),
      manifest: createManifest(1),
      adapter: stubAdapter({ saveState }),
      loadLayout: () => import('./fixtures/persisting-layout.svelte'),
    });

    await vi.waitFor(() =>
      expect(saveState.mock.lastCall?.[0].u).toEqual({
        'layout-note': 'written-before-ready',
      }),
    );
  });

  it('registers the xAPI client built for the course', async () => {
    const config = createConfig();
    const adapter = stubAdapter();
    const client = {};
    const buildXAPIClient = vi.fn(async () => client);
    await mountApp({
      config,
      manifest: createManifest(1),
      adapter,
      buildXAPIClient,
    });
    const { useXAPI } = await import('../src/runtime/xapi/registry.js');

    await vi.waitFor(() => expect(useXAPI()).toBe(client));
    expect(buildXAPIClient).toHaveBeenCalledWith(config, adapter, undefined);
  });
});
