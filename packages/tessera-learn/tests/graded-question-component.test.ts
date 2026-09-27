// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { isPageComplete } from '../src/runtime/navigation.svelte.js';
import {
  setNavContext,
  setPageContext,
  setInPage,
} from '../src/runtime/contexts.js';
import { createManifest, createConfig } from './helpers.js';
import { mountInBody } from './helpers/mount.js';

function answer(graded: boolean | undefined) {
  const manifest = createManifest(2, {}, { 0: { graded: true } });
  const config = createConfig();
  const progress = new ProgressState(manifest, config);
  const { target } = mountInBody(MultipleChoice, {
    props: {
      id: 'q1',
      question: 'Pick one',
      options: ['a', 'b'],
      correct: 0,
      graded,
    },
    setup: () => {
      setNavContext({
        nav: { currentPageIndex: 0 },
        manifest,
        progress,
        config,
      } as any);
      setPageContext({
        quiz: null,
        quizState: null,
        passingScore: 70,
        index: 0,
      });
      setInPage(true);
    },
  });
  const radio = target.querySelector('input[type="radio"]') as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  progress.markVisited(0);
  return { progress, manifest, config };
}

describe('graded prop on a built-in question', () => {
  it('scores the page so a declared graded page can complete', () => {
    const { progress, manifest, config } = answer(true);
    expect(progress.pageScore(0)).toBe(100);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('leaves the page unscored without it', () => {
    const { progress, manifest, config } = answer(undefined);
    expect(progress.pageScore(0)).toBeUndefined();
    expect(isPageComplete(0, manifest, progress, config)).toBe(false);
  });
});
