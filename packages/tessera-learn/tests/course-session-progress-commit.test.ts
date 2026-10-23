// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useFakeTimers } from './helpers.js';
import {
  createSession,
  pagehide,
  recordingAdapter,
} from './helpers/session.svelte.js';

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

async function launch() {
  useFakeTimers();
  const { adapter, calls } = recordingAdapter();
  const course = createSession({ adapter });
  await course.session.start();
  await tick();
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
    await tick(5_000);

    nav.goToPage(1);
    await tick();

    expect(calls).toEqual(['saveState', 'setDuration:5', 'commit']);
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
      'setDuration:0',
      'commit',
      'saveState',
      'saveState',
    ]);

    await tick(1);

    expect(calls.slice(5)).toEqual(['setDuration:10', 'commit']);
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

    expect(calls).toEqual(['setDuration:2', 'commit']);
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
