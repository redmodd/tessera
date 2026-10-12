// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Component } from 'svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import {
  setNavContext,
  setPageContext,
  setInPage,
} from '../src/runtime/contexts.js';
import { createManifest, createConfig } from './helpers.js';
import { mountInBody } from './helpers/mount.js';
import { savedIndex } from '../src/components/util.js';

// Mounts a widget on a page the learner already answered it on.
function revisit(
  widget: Component<any>,
  props: Record<string, unknown>,
  saved: { score: number; retries?: number; answer?: unknown },
) {
  const manifest = createManifest(1);
  const config = createConfig();
  const progress = new ProgressState(manifest, config);
  progress.markStandaloneQuestion(
    0,
    'q1',
    saved.score,
    false,
    1,
    saved.retries,
    saved.answer,
  );
  const { target } = mountInBody(widget, {
    props: { id: 'q1', question: 'Question', ...props },
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
  const all = <T extends Element>(selector: string) => [
    ...target.querySelectorAll<T>(selector),
  ];
  return { target, all, retry: () => all('.tessera-standalone-retry') };
}

describe('a built-in question the learner returns to', () => {
  it('MultipleChoice shows the chosen option, locked once correct', () => {
    const { all, retry } = revisit(
      MultipleChoice,
      { options: ['a', 'b', 'c'], correct: 1 },
      { score: 100, answer: ['1'] },
    );
    const radios = all<HTMLInputElement>('input[type="radio"]');

    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(radios.every((r) => r.disabled)).toBe(true);
    expect(retry()).toHaveLength(0);
  });

  it('MultipleChoice offers Try again on a wrong answer until maxRetries is spent', () => {
    const props = { options: ['a', 'b'], correct: 1, maxRetries: 1 };
    const wrong = { score: 0, answer: ['0'] };

    expect(revisit(MultipleChoice, props, wrong).retry()).toHaveLength(1);
    expect(
      revisit(MultipleChoice, props, { ...wrong, retries: 1 }).retry(),
    ).toHaveLength(0);
  });

  it('MultipleChoice keeps a full score locked and marked correct when its answer was not saved', () => {
    const { target, all, retry } = revisit(
      MultipleChoice,
      {
        options: ['a', 'b'],
        correct: 1,
        correctFeedback: 'Well done',
        incorrectFeedback: 'Not quite',
      },
      { score: 100 },
    );
    const radios = all<HTMLInputElement>('input[type="radio"]');

    expect(radios.every((r) => r.disabled && !r.checked)).toBe(true);
    expect(target.textContent).toContain('Well done');
    expect(target.textContent).not.toContain('Not quite');
    expect(retry()).toHaveLength(0);
  });

  it('takes a saved index only from a whole number the question has', () => {
    const list = ['a', 'b'];

    expect(savedIndex('1', list)).toBe(1);
    expect(savedIndex(0, list)).toBe(0);
    for (const value of [null, '', ' ', [], [1], true, '0x1', '2', -1, 0.5]) {
      expect(() => savedIndex(value, list)).toThrow(RangeError);
    }
  });

  it('shows no answer when the saved one points past an edited question', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const choice = revisit(
      MultipleChoice,
      { options: ['a', 'b'], correct: 1 },
      { score: 0, answer: ['2'] },
    );
    const sorting = revisit(
      Sorting,
      { items: ['i0', 'i1'], targets: ['t0'], correct: [0, 0] },
      {
        score: 0,
        answer: [
          ['0', '0'],
          ['1', '1'],
        ],
      },
    );
    const matching = revisit(
      Matching,
      { pairs: [{ left: 'L0', right: 'R0' }] },
      {
        score: 0,
        answer: [
          ['0', '1'],
          ['1', '0'],
        ],
      },
    );

    expect(
      choice.all<HTMLInputElement>('input[type="radio"]').map((r) => r.checked),
    ).toEqual([false, false]);
    expect(sorting.all('.tessera-sorting-placed-item')).toHaveLength(0);
    expect(matching.all('.tessera-matching-item.matched')).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('FillInTheBlank shows the typed answer', () => {
    const { target, all } = revisit(
      FillInTheBlank,
      { answers: ['blue'] },
      { score: 100, answer: 'blue' },
    );
    const [input] = all<HTMLInputElement>('input[type="text"]');

    expect(input.value).toBe('blue');
    expect(input.disabled).toBe(true);
    expect(all('.tessera-fitb-check-btn')).toHaveLength(0);
    expect(target.textContent).toContain('Correct');
  });

  it('Matching shows the pairs as matched', () => {
    const { all, retry } = revisit(
      Matching,
      {
        pairs: [
          { left: 'L0', right: 'R0' },
          { left: 'L1', right: 'R1' },
        ],
      },
      {
        score: 0,
        answer: [
          ['0', '1'],
          ['1', '0'],
        ],
      },
    );

    expect(all('.tessera-matching-item.left.matched')).toHaveLength(2);
    expect(all('.tessera-matching-item.left.incorrect')).toHaveLength(2);
    expect(all('.tessera-matching-item.right.matched')).toHaveLength(2);
    expect(retry()).toHaveLength(1);
  });

  it('Sorting shows each item in the target it was placed in', () => {
    const { all } = revisit(
      Sorting,
      { items: ['i0', 'i1', 'i2'], targets: ['t0', 't1'], correct: [1, 0, 1] },
      {
        score: 100,
        answer: [
          ['0', '1'],
          ['1', '0'],
          ['2', '1'],
        ],
      },
    );
    const placed = all('.tessera-sorting-target').map((t) =>
      [...t.querySelectorAll('.tessera-sorting-item-text')].map(
        (item) => item.textContent,
      ),
    );

    expect(placed).toEqual([['i1'], ['i0', 'i2']]);
    expect(all('.tessera-sorting-placed-item.correct')).toHaveLength(3);
    expect(all('.tessera-sorting-deck')).toHaveLength(0);
  });
});
