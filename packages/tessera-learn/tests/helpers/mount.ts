import { onTestFinished } from 'vitest';
import { mount, unmount, type Component, type MountOptions } from 'svelte';
import type { QuizEngine } from '../../src/runtime/quiz-engine.svelte.js';
import {
  ProgressState,
  type StandaloneSubmit,
} from '../../src/runtime/progress.svelte.js';
import type { CourseConfig, QuizConfig } from '../../src/runtime/types.js';
import type { Manifest } from '../../src/plugin/manifest.js';
import {
  setInPage,
  setNavContext,
  setPageContext,
} from '../../src/runtime/contexts.js';
import HarnessSvelte from '../fixtures/use-quiz-harness.svelte';
import { createConfig, createManifest } from '../helpers.js';

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

/** Mounts a component as the content of page 0, a quiz page when `quiz` is given. */
export function mountOnPage(
  component: Component<any>,
  props: Record<string, unknown>,
  course: { manifest: Manifest; progress: ProgressState; config: CourseConfig },
  quiz: QuizConfig | null = null,
) {
  return mountInBody(component, {
    props,
    setup: () => {
      setNavContext({ nav: { currentPageIndex: 0 }, ...course } as any);
      setPageContext({
        quiz,
        quizState: null,
        passingScore: 70,
        index: 0,
      });
      setInPage(true);
    },
  });
}

export type SavedAnswer = StandaloneSubmit & { score: number };

/**
 * Mounts question `q1` on page 0, already answered when `saved` is given,
 * on a quiz page when `quiz` is given.
 */
export function mountQuestion(
  widget: Component<any>,
  props: Record<string, unknown>,
  { saved, quiz }: { saved?: SavedAnswer; quiz?: QuizConfig } = {},
) {
  const manifest = createManifest(1);
  const config = createConfig();
  const progress = new ProgressState(manifest, config);
  if (saved) {
    progress.markStandaloneQuestion(0, 'q1', saved.score, false, 1, saved);
  }
  return mountOnPage(
    widget,
    { id: 'q1', question: 'Question', ...props },
    { manifest, progress, config },
    quiz,
  );
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
