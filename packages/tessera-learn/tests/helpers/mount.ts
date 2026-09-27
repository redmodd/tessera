import { onTestFinished } from 'vitest';
import { mount, unmount, type Component, type MountOptions } from 'svelte';
import type { QuizEngine } from '../../src/runtime/quiz-engine.svelte.js';
import HarnessSvelte from '../fixtures/use-quiz-harness.svelte';

export function mountInBody<Props extends Record<string, any>>(
  component: Component<Props>,
  options: Omit<MountOptions<Props>, 'target'>,
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(component, {
    ...options,
    target,
  } as MountOptions<Props>);
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
  handle: QuizEngine | null;
  secondHandle?: QuizEngine | null;
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
