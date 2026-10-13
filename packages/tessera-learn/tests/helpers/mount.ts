import { onTestFinished } from 'vitest';
import { mount, unmount, type Component, type MountOptions } from 'svelte';
import type { QuizEngine } from '../../src/runtime/quiz-engine.svelte.js';
import type { ProgressState } from '../../src/runtime/progress.svelte.js';
import type { CourseConfig } from '../../src/runtime/types.js';
import type { Manifest } from '../../src/plugin/manifest.js';
import {
  setInPage,
  setNavContext,
  setPageContext,
} from '../../src/runtime/contexts.js';
import HarnessSvelte from '../fixtures/use-quiz-harness.svelte';

export function mountInBody<Props extends Record<string, any>>(
  component: Component<Props>,
  {
    setup,
    ...options
  }: Omit<MountOptions<Props>, 'target'> & { setup?: () => void },
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const root: Component<Props> = setup
    ? (internals, props) => {
        setup();
        return component(internals, props);
      }
    : component;
  const instance = mount(root, {
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

/** Mounts a component as the content of page 0, outside a quiz. */
export function mountOnPage(
  component: Component<any>,
  props: Record<string, unknown>,
  course: { manifest: Manifest; progress: ProgressState; config: CourseConfig },
) {
  return mountInBody(component, {
    props,
    setup: () => {
      setNavContext({ nav: { currentPageIndex: 0 }, ...course } as any);
      setPageContext({
        quiz: null,
        quizState: null,
        passingScore: 70,
        index: 0,
      });
      setInPage(true);
    },
  });
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
