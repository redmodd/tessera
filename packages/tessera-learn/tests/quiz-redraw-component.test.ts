// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import RedrawQuiz from './fixtures/redraw-quiz.svelte';
import ReviewRemountQuiz from './fixtures/review-remount-quiz.svelte';
import { mountQuestion } from './helpers/mount.js';

function mountRedraw(draws: string[][]) {
  const { target, unmount } = mountQuestion(
    RedrawQuiz,
    { draws },
    { quiz: { graded: true } },
  );
  flushSync();
  const click = (el: Element) => {
    (el as HTMLElement).click();
    flushSync();
  };
  const button = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const drawn = () => [
    ...new Set(
      [...target.querySelectorAll('input[type="radio"]')].map(
        (r) => (r as HTMLInputElement).name,
      ),
    ),
  ];
  const answerAll = () => {
    for (let i = 0; i < drawn().length; i++) {
      click(
        target.querySelector('.tessera-quiz-question-wrapper.active input')!,
      );
      click(button(i < drawn().length - 1 ? 'Next' : 'Submit'));
    }
  };
  return { target, unmount, click, button, drawn, answerAll };
}

describe('a quiz that redraws its questions under {#key}', () => {
  it('replaces the set, dropping its answers, while answering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quiz = mountRedraw([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    quiz.click(quiz.target.querySelector('input')!);

    quiz.click(quiz.button('Redraw'));
    expect(quiz.drawn()).toEqual(['b', 'c']);
    expect(quiz.target.textContent).toContain('Question 1 of 2');
    expect(
      quiz.target.querySelector<HTMLInputElement>('input:checked'),
    ).toBeNull();
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/duplicate question id/),
    );
  });

  it('keeps the current question in range when a redraw has fewer', () => {
    const quiz = mountRedraw([['a', 'b', 'c'], ['d']]);
    for (let i = 0; i < 2; i++) {
      quiz.click(
        quiz.target.querySelector(
          '.tessera-quiz-question-wrapper.active input',
        )!,
      );
      quiz.click(quiz.button('Next'));
    }

    quiz.click(quiz.button('Redraw'));
    expect(quiz.target.textContent).toContain('Question 1 of 1');
    expect(
      quiz.target.querySelectorAll('.tessera-quiz-question-wrapper.active'),
    ).toHaveLength(1);
  });

  it('scores only the new draw after a retry', () => {
    const quiz = mountRedraw([
      ['a', 'b'],
      ['c', 'd', 'e'],
    ]);
    quiz.answerAll();
    expect(quiz.target.textContent).toContain('You answered 2 of 2');

    quiz.click(quiz.button('Retry Quiz'));
    quiz.click(quiz.button('Redraw'));
    expect(quiz.drawn()).toEqual(['c', 'd', 'e']);
    quiz.answerAll();
    expect(quiz.target.textContent).toContain('You answered 3 of 3');
  });

  it('still warns when the page unmounts with answers never submitted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quiz = mountRedraw([['a']]);
    quiz.click(quiz.target.querySelector('input')!);

    quiz.unmount();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/submit\(\) was never called/),
    );
  });
});

describe('a custom shell that remounts its questions for review', () => {
  it('reviews the submitted answers, one entry per question', async () => {
    const ref: { quiz?: any } = {};
    const { target } = mountQuestion(
      ReviewRemountQuiz,
      { ref },
      { quiz: { graded: true } },
    );
    flushSync();
    await Promise.resolve();
    const radios = target.querySelectorAll<HTMLInputElement>('input');
    radios[0].click();
    radios[3].click();
    flushSync();

    ref.quiz.submit();
    flushSync();
    ref.quiz.startReview();
    flushSync();
    expect(ref.quiz.questions.map((q: any) => q.id)).toEqual(['a', 'b']);
    expect(ref.quiz.questions.map((q: any) => q.correct)).toEqual([
      true,
      false,
    ]);
    expect(
      [...target.querySelectorAll<HTMLInputElement>('input:checked')].map(
        (r) => r.name,
      ),
    ).toEqual(['a', 'b']);
  });
});
