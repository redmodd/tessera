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
  useFakeTimers,
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

function stubAnimate(finishes: boolean) {
  Element.prototype.animate = () => {
    const animation = {
      onfinish: null as (() => void) | null,
      cancel() {},
    };
    if (finishes) setTimeout(() => animation.onfinish?.(), 0);
    return animation as unknown as Animation;
  };
  onTestFinished(() => {
    delete (Element.prototype as Partial<Element>).animate;
  });
}

const exitButton = () =>
  document.querySelector<HTMLButtonElement>('.tessera-exit-btn');

const exitDialog = () =>
  document.querySelector<HTMLDialogElement>('.tessera-exit-dialog')!;

const dialogButton = (label: string) =>
  [...exitDialog().querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  )!;

function confirmExit() {
  exitButton()!.click();
  dialogButton('Exit course').click();
}

function enterBfcache() {
  window.dispatchEvent(
    new PageTransitionEvent('pagehide', { persisted: true }),
  );
}

function restoreFromBfcache() {
  window.dispatchEvent(
    new PageTransitionEvent('pageshow', { persisted: true }),
  );
}

function bfcacheRoundTrip() {
  enterBfcache();
  restoreFromBfcache();
}

const leavingTheCourse: [string, () => unknown][] = [
  ['the exit', () => navCtx().exit()],
  ['a back/forward cache restore', bfcacheRoundTrip],
];

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
    dialogButton('Cancel').click();
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
    stubAnimate(true);
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

  it('ends the session at the deadline when a layout outro never finishes', async () => {
    stubAnimate(false);
    const { adapter, calls } = recordingAdapter();
    await mount(adapter, {
      loadLayout: () => import('./fixtures/fading-layout.svelte'),
    });
    const launched = calls.length;
    useFakeTimers();

    const exiting = navCtx().exit();
    await vi.advanceTimersByTimeAsync(10_000);
    await exiting;

    expect(calls.slice(launched)).toEqual([
      'saveState',
      'setDuration:10',
      'setExit:suspend',
      'commit',
      'terminate',
    ]);
  });

  it.each(leavingTheCourse)(
    'drops a page still loading after %s',
    async (_, leave) => {
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
      await leave();
      await new Promise((r) => setTimeout(r, 150));
      expect(document.querySelector('.tessera-loading-bar')).toBeNull();
      release();
      await flush();

      expect(navCtx().progress.visitedPages.has(1)).toBe(false);
    },
  );

  it.each(leavingTheCourse)(
    'drops the manual-completion watchdog after %s',
    async (_, leave) => {
      useFakeTimers({ shouldAdvanceTime: true });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { adapter } = recordingAdapter();
      await mount(adapter, {
        config: manualConfig(),
        loadLayout: masteryLayout,
      });

      await leave();
      vi.advanceTimersByTime(60_000);

      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('offers no Exit button without an LMS', async () => {
    const config = createConfig();
    const manifest = createManifest(2);
    await mount(new WebAdapter(config, manifest), { config, manifest });

    expect(document.querySelector('.tessera-sidebar')).not.toBeNull();
    expect(exitButton()).toBeNull();
  });
});
