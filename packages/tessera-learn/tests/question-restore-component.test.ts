// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Component } from 'svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import { mountQuestion } from './helpers/mount.js';

// Mounts a widget on a page the learner already answered it on.
function revisit(
  widget: Component<any>,
  props: Record<string, unknown>,
  saved: { score: number; retries?: number; response?: unknown },
) {
  const { target } = mountQuestion(widget, props, saved);
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
      { score: 100, response: ['1'] },
    );
    const radios = all<HTMLInputElement>('input[type="radio"]');

    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(radios.every((r) => r.disabled)).toBe(true);
    expect(retry()).toHaveLength(0);
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

  it('shows no answer when the saved one points past an edited question', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const choice = revisit(
      MultipleChoice,
      { options: ['a', 'b'], correct: 1 },
      { score: 0, response: ['2'] },
    );
    const sorting = revisit(
      Sorting,
      { items: ['i0', 'i1'], targets: ['t0'], correct: [0, 0] },
      {
        score: 0,
        response: [
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
        response: [
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
  });

  it('FillInTheBlank shows the typed answer', () => {
    const { target, all } = revisit(
      FillInTheBlank,
      { answers: ['blue'] },
      { score: 100, response: 'blue' },
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
        response: [
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
        response: [
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
