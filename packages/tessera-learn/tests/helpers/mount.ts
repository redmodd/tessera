import { onTestFinished } from 'vitest';
import { mount, unmount } from 'svelte';
import type { UseQuizHandle } from '../../src/runtime/hooks.svelte.js';
import HarnessSvelte from '../fixtures/use-quiz-harness.svelte';

type MountOptions = Omit<Parameters<typeof mount>[1], 'target'>;

export function mountInBody(
  component: Parameters<typeof mount>[0],
  options: MountOptions = {} as MountOptions,
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(component, { ...options, target });
  let mounted = true;
  const destroy = () => {
    if (!mounted) return;
    mounted = false;
    try {
      unmount(instance);
    } finally {
      target.remove();
    }
  };
  onTestFinished(destroy);
  return { target, unmount: destroy };
}

export interface HarnessRef {
  handle: UseQuizHandle | null;
  secondHandle?: UseQuizHandle | null;
  element: HTMLElement | null;
  events: Array<{ score: number }>;
  thrown: unknown;
}

export function mountHarness(
  quizConfig: unknown,
  props: {
    secondQuiz?: boolean;
    nullElement?: boolean;
    adapter?: unknown;
    quizState?: { attempts: number; score: number };
    navCtx?: unknown;
    pageIndex?: number;
  } = {},
) {
  const ref: HarnessRef = {
    handle: null,
    element: null,
    events: [],
    thrown: null,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  onTestFinished(() => host.remove());
  const { unmount } = mountInBody(HarnessSvelte, {
    props: { ref, quizConfig, host, ...props },
  });
  return { ref, unmount };
}
