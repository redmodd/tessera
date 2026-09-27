// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import type { CourseConfig } from '../src/runtime/types.js';
import {
  createConfig,
  createManifest,
  flush,
  manualConfig,
  mountApp,
  navCtx,
  stubAdapter,
} from './helpers.js';

function recordingAdapter(overrides: Partial<BaseAdapter> = {}) {
  const calls: string[] = [];
  const record = (name: string) => () => {
    calls.push(name);
  };
  const adapter = stubAdapter({
    saveState: record('saveState'),
    setDuration: (seconds) => calls.push(`setDuration:${seconds}`),
    setExit: (mode) => calls.push(`setExit:${mode}`),
    commit: record('commit'),
    terminate: record('terminate'),
    ...overrides,
  });
  return { adapter, calls };
}

async function mount(
  adapter: BaseAdapter,
  {
    config = createConfig(),
    manifest = createManifest(2),
    loadLayout,
  }: {
    config?: CourseConfig;
    manifest?: ReturnType<typeof createManifest>;
    loadLayout?: () => Promise<{ default: unknown }>;
  } = {},
) {
  await mountApp({ config, manifest, adapter, loadLayout });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Test page'),
  );
  await flush();
}

const exitButton = () =>
  document.querySelector<HTMLButtonElement>('.tessera-exit-btn');

const EXIT_SEQUENCE = [
  'saveState',
  'setDuration:0',
  'setExit:suspend',
  'commit',
  'terminate',
];

let close: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  close = vi.spyOn(window, 'close').mockImplementation(() => {});
});

describe('exiting a course', () => {
  it('ends the session from the Exit button and shows the ended screen', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter);
    const launched = calls.length;

    exitButton()!.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Session ended'),
    );
    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(document.querySelector('.tessera-content')).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('exits normally once the course is complete', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter, {
      config: manualConfig(),
      manifest: createManifest(1, {}, { 0: { completesOn: 'view' } }),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });
    await vi.waitFor(() =>
      expect(navCtx().progress.completionStatus).toBe('complete'),
    );

    await navCtx().exit();

    expect(calls).toContain('setExit:normal');
  });

  it('terminates on pagehide while the exit is still saving', async () => {
    const { adapter, calls } = recordingAdapter({
      exit: () => new Promise<boolean>(() => {}),
    });
    await mount(adapter);
    const launched = calls.length;

    exitButton()!.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Ending session'),
    );
    window.dispatchEvent(new Event('pagehide'));

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
  });

  it('shows the ended screen when the exit fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = recordingAdapter({
      exit: async () => {
        throw new Error('boom');
      },
    });
    await mount(adapter);

    exitButton()!.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Session ended'),
    );
    expect(warn).toHaveBeenCalledWith(
      'Tessera: exit failed',
      expect.any(Error),
    );
    expect(close).toHaveBeenCalled();
  });

  it('terminates without exiting on pagehide', async () => {
    const exit = vi.fn(async () => true);
    const { adapter, calls } = recordingAdapter({ exit });
    await mount(adapter);
    const launched = calls.length;

    window.dispatchEvent(new Event('pagehide'));

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves the window open when the adapter returns the learner to the LMS', async () => {
    const exit = vi.fn(async () => true);
    const { adapter } = recordingAdapter({ exit });
    await mount(adapter);

    exitButton()!.click();

    await vi.waitFor(() => expect(exit).toHaveReturned());
    await flush();
    expect(document.body.textContent).toContain('Ending session');
    expect(close).not.toHaveBeenCalled();
  });

  it('offers no Exit button without an LMS', async () => {
    const config = createConfig();
    const manifest = createManifest(2);
    await mount(new WebAdapter(config, manifest), { config, manifest });

    expect(document.querySelector('.tessera-sidebar')).not.toBeNull();
    expect(exitButton()).toBeNull();
  });
});
