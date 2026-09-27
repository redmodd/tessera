// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  onTestFinished,
  type MockInstance,
} from 'vitest';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
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

async function mount(
  adapter: BaseAdapter,
  options: Partial<Parameters<typeof mountApp>[0]> = {},
) {
  await mountApp({
    config: createConfig(),
    manifest: createManifest(2),
    adapter,
    ...options,
  });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Test page'),
  );
  await flush();
}

const masteryLayout = () => import('./fixtures/mastery-layout.svelte');

const exitButton = () =>
  document.querySelector<HTMLButtonElement>('.tessera-exit-btn');

const exitDialog = () =>
  document.querySelector<HTMLDialogElement>('.tessera-exit-dialog')!;

function confirmExit() {
  exitButton()!.click();
  document.querySelector<HTMLButtonElement>('.tessera-exit-confirm')!.click();
}

HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

const EXIT_SEQUENCE = [
  'saveState',
  'setDuration:0',
  'setExit:suspend',
  'commit',
  'terminate',
];

let close: MockInstance<typeof window.close>;

beforeEach(() => {
  close = vi.spyOn(window, 'close').mockImplementation(() => {});
});

describe('exiting a course', () => {
  it('ends the session from the Exit button and shows the ended screen', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter);
    const launched = calls.length;

    confirmExit();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Session ended'),
    );
    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(document.querySelector('.tessera-content')).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('asks for confirmation before ending the session', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter);
    const launched = calls.length;

    exitButton()!.click();
    await flush();

    expect(exitDialog().open).toBe(true);
    expect(calls.slice(launched)).toEqual([]);
    expect(document.querySelector('.tessera-content')).not.toBeNull();
  });

  it('keeps the session when the learner cancels the exit', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter);
    const launched = calls.length;

    exitButton()!.click();
    [...exitDialog().querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();
    await flush();

    expect(exitDialog().open).toBe(false);
    expect(calls.slice(launched)).toEqual([]);
    expect(document.querySelector('.tessera-content')).not.toBeNull();
  });

  it('moves focus to the exit screen', async () => {
    const { adapter } = recordingAdapter();
    await mount(adapter);

    confirmExit();

    await vi.waitFor(() =>
      expect(document.activeElement?.className).toBe('tessera-session-ended'),
    );
  });

  it('offers no exit until the launch finishes', async () => {
    const canExitAtLaunch: boolean[] = [];
    const { adapter } = recordingAdapter({
      setCompletionStatus: () => canExitAtLaunch.push(navCtx().canExit),
    });
    await mount(adapter, { loadLayout: masteryLayout });

    expect(canExitAtLaunch[0]).toBe(false);
    expect(navCtx().canExit).toBe(true);
  });

  it('unmounts the course before the final save', async () => {
    const mountedAtSave: boolean[] = [];
    const { adapter } = recordingAdapter({
      saveState: () =>
        mountedAtSave.push(!!document.querySelector('.tessera-content')),
    });
    await mount(adapter);

    confirmExit();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Session ended'),
    );
    expect(mountedAtSave.at(-1)).toBe(false);
  });

  it('waits for a layout outro before the final save', async () => {
    Element.prototype.animate = () => {
      const animation = {
        onfinish: null as (() => void) | null,
        cancel() {},
      };
      setTimeout(() => animation.onfinish?.(), 0);
      return animation as unknown as Animation;
    };
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });
    const mountedAtSave: boolean[] = [];
    const { adapter } = recordingAdapter({
      saveState: () =>
        mountedAtSave.push(!!document.querySelector('.fading-layout')),
    });
    await mount(adapter, {
      loadLayout: () => import('./fixtures/fading-layout.svelte'),
    });

    await navCtx().exit();

    expect(mountedAtSave.at(-1)).toBe(false);
  });

  it('drops a page that finishes loading after the exit', async () => {
    let release!: () => void;
    const page = () => import('./fixtures/app-page.svelte');
    let loads = 0;
    const loadPage = () =>
      loads++ === 0
        ? page()
        : new Promise((resolve) => (release = () => resolve(page())));
    const { adapter } = recordingAdapter();
    await mount(adapter, { loadLayout: masteryLayout, loadPage });

    navCtx().nav.goToPage(1);
    await flush();
    await navCtx().exit();
    release();
    await flush();

    expect(navCtx().progress.visitedPages.has(1)).toBe(false);
  });

  it('exits normally once the course is complete', async () => {
    const { adapter, calls } = recordingAdapter();
    await mount(adapter, {
      config: manualConfig(),
      manifest: createManifest(1, {}, { 0: { completesOn: 'view' } }),
      loadLayout: masteryLayout,
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

    confirmExit();
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

    confirmExit();

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
    const exit = vi.fn();
    const { adapter, calls } = recordingAdapter({ exit });
    await mount(adapter);
    const launched = calls.length;

    window.dispatchEvent(new Event('pagehide'));

    expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE);
    expect(exit).not.toHaveBeenCalled();
  });

  it("waits for the course's xAPI destinations before ending the session", async () => {
    const drained = Promise.withResolvers<void>();
    const flush = vi.fn(() => drained.promise);
    const { adapter, calls } = recordingAdapter();
    await mount(adapter, { xapiClient: { markUnloading() {}, flush } });
    const launched = calls.length;

    confirmExit();
    await vi.waitFor(() => expect(flush).toHaveBeenCalled());
    expect(calls.slice(launched)).toEqual([]);

    drained.resolve();
    await vi.waitFor(() =>
      expect(calls.slice(launched)).toEqual(EXIT_SEQUENCE),
    );
  });

  it('bounds the xAPI flush and the adapter exit by one deadline', async () => {
    const flush = vi.fn(async (_deadline: Promise<unknown>) => {});
    const exit = vi.fn(async () => false);
    const { adapter } = recordingAdapter({ exit });
    await mount(adapter, { xapiClient: { markUnloading() {}, flush } });

    confirmExit();

    await vi.waitFor(() =>
      expect(exit).toHaveBeenCalledWith(flush.mock.calls[0][0]),
    );
  });

  it('switches xAPI sends to keepalive on pagehide but not on exit', async () => {
    const markUnloading = vi.fn();
    const { adapter } = recordingAdapter();
    await mount(adapter, {
      loadLayout: masteryLayout,
      xapiClient: { markUnloading, flush: async () => {} },
    });

    await navCtx().exit();
    expect(markUnloading).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));
    expect(markUnloading).toHaveBeenCalled();
  });

  it('withdraws the Exit button once pagehide ends the session', async () => {
    const { adapter } = recordingAdapter();
    await mount(adapter);

    window.dispatchEvent(new Event('pagehide'));
    await flush();

    expect(exitButton()).toBeNull();
  });

  it('leaves the window open when the adapter returns the learner to the LMS', async () => {
    const exit = vi.fn(async () => true);
    const { adapter } = recordingAdapter({ exit });
    await mount(adapter);

    confirmExit();

    await vi.waitFor(() => expect(exit).toHaveReturned());
    await flush();
    expect(document.body.textContent).toContain('Session ended');
    expect(close).not.toHaveBeenCalled();
  });

  it('offers no Exit button without an LMS', async () => {
    const config = createConfig();
    const manifest = createManifest(2);
    await mount(new WebAdapter(config, manifest), { config, manifest });

    expect(document.querySelector('.tessera-sidebar')).not.toBeNull();
    expect(exitButton()).toBeNull();
  });

  it('ignores exit() without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    await mount(adapter, { loadLayout: masteryLayout });
    const launched = calls.length;

    await navCtx().exit();

    expect(calls.slice(launched)).toEqual([]);
    expect(document.body.textContent).not.toContain('Session ended');
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps saving after pagehide without an LMS', async () => {
    const { adapter, calls } = recordingAdapter({ connected: false });
    await mount(adapter, { loadLayout: masteryLayout });
    window.dispatchEvent(new Event('pagehide'));
    const hidden = calls.length;

    navCtx().nav.goToPage(1);
    await flush();

    expect(calls.slice(hidden)).toContain('saveState');
  });
});
