// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';

describe('a page that throws while rendering', () => {
  it('shows the error page in the course chrome', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountApp({
      config: createConfig({ resume: 'auto' }),
      manifest: createManifest(2),
      adapter: stubAdapter(),
      loadPage: () => import('./fixtures/question-no-id-page.svelte'),
    });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('This page failed to load'),
    );
    expect(document.body.textContent).toContain('has no id');
    expect(document.querySelector('.tessera-nav, nav')).not.toBeNull();
  });
});
