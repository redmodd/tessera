// @vitest-environment jsdom
import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { useFakeTimers } from './helpers.js';
import {
  createSession,
  pagehide,
  recordingAdapter,
} from './helpers/session.svelte.js';

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

// Past the ten seconds the launch commit holds the next one back.
async function launch() {
  useFakeTimers();
  const { adapter, calls } = recordingAdapter({
    setCompletionStatus: (status) => calls.push(`completion:${status}`),
  });
  const course = createSession({ adapter });
  await course.session.start();
  await tick(10_000);
  calls.length = 0;
  return { ...course, calls };
}

function hidePage() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('committing progress saves', () => {
  it('commits a page change with the session time', async () => {
    const { nav, calls } = await launch();

    nav.goToPage(1);
    await tick();

    expect(calls).toEqual(['saveState', 'setDuration:10', 'commit']);
  });

  it('commits saves made within ten seconds of a commit once, when the ten seconds are up', async () => {
    const { session, calls } = await launch();
    session.userStateStore.set('notes', 'a');
    await tick();
    session.userStateStore.set('notes', 'ab');
    await tick(1_000);
    session.userStateStore.set('notes', 'abc');
    await tick(8_999);

    expect(calls).toEqual([
      'saveState',
      'setDuration:10',
      'commit',
      'saveState',
      'saveState',
    ]);

    await tick(1);

    expect(calls.slice(5)).toEqual(['setDuration:20', 'commit']);
  });

  it('commits a save and a status change together, and holds the next save back', async () => {
    const { progress, session, calls } = await launch();

    progress.markVisited(0);
    progress.markVisited(1);
    await tick();
    session.userStateStore.set('notes', 'a');
    await tick(9_999);

    expect(calls).toEqual([
      'setDuration:10',
      'saveState',
      'completion:complete',
      'setExit:normal',
      'commit',
      'saveState',
    ]);
  });

  it('commits right away when the page is hidden', async () => {
    const { session, calls } = await launch();
    session.userStateStore.set('notes', 'a');
    await tick();
    session.userStateStore.set('notes', 'ab');
    await tick(2_000);
    calls.length = 0;

    hidePage();
    await tick(10_000);

    expect(calls).toEqual(['setDuration:12', 'commit']);
  });

  it('commits a save made by a hide listener that runs after the hidden-page commit', async () => {
    const { session, calls } = await launch();
    const saveOnHide = () => {
      if (document.visibilityState === 'hidden') {
        session.userStateStore.set('notes', 'saved on hide');
      }
    };
    document.addEventListener('visibilitychange', saveOnHide);
    onTestFinished(() =>
      document.removeEventListener('visibilitychange', saveOnHide),
    );

    hidePage();
    await tick();

    expect(calls).toEqual([
      'setDuration:10',
      'commit',
      'saveState',
      'setDuration:10',
      'commit',
    ]);
  });

  it('commits nothing when the page is hidden before the saved state loads', async () => {
    useFakeTimers();
    let loaded!: () => void;
    const { adapter, calls } = recordingAdapter({
      loadState: () => new Promise<void>((resolve) => (loaded = resolve)),
    });
    const { session } = createSession({ adapter });
    const started = session.start();
    await tick();

    hidePage();
    expect(calls).toEqual([]);

    loaded();
    await started;
  });

  it('commits nothing more once the session ends', async () => {
    const { session, calls } = await launch();
    session.userStateStore.set('notes', 'a');
    await tick();
    session.userStateStore.set('notes', 'ab');
    await tick();
    pagehide();
    calls.length = 0;

    hidePage();
    await tick(10_000);

    expect(calls).toEqual([]);
  });
});
