// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import RedrawQuiz from './fixtures/redraw-quiz.svelte';
import RemountQuiz from './fixtures/remount-quiz.svelte';
import { mountQuestion } from './helpers/mount.js';
import type { QuizConfig } from '../src/runtime/types.js';
import type { QuizPageState } from '../src/runtime/contexts.js';

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
  it('replaces the set, dropping its answers, while answering', () => {
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

  it('starts from the first question when the current one leaves', () => {
    const quiz = mountRedraw([['a', 'b', 'c'], ['d'], ['e', 'f', 'g']]);
    for (let i = 0; i < 2; i++) {
      quiz.click(
        quiz.target.querySelector(
          '.tessera-quiz-question-wrapper.active input',
        )!,
      );
      quiz.click(quiz.button('Next'));
    }

    quiz.click(quiz.button('Redraw'));
    quiz.click(quiz.button('Redraw'));
    expect(quiz.target.textContent).toContain('Question 1 of 3');
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

describe('a custom shell that remounts its questions', () => {
  function mountRemount(
    props: Record<string, unknown>,
    quiz: QuizConfig = { graded: true },
    quizState?: QuizPageState,
  ) {
    const ref: { quiz?: any; drop?: (i: number) => void } = {};
    const { target } = mountQuestion(
      RemountQuiz,
      { ref, ...props },
      { quiz, quizState },
    );
    flushSync();
    const pick = (id: string, option: number) => {
      target
        .querySelectorAll<HTMLInputElement>(`input[name="${id}"]`)
        [option].click();
      flushSync();
    };
    const run = (action: () => void) => {
      action();
      flushSync();
    };
    return { target, ref, pick, run };
  }

  it('reviews the submitted answers, one entry per question', () => {
    const { target, ref, pick, run } = mountRemount({
      ids: ['a', 'b'],
      hideOnResults: true,
    });
    pick('a', 0);
    pick('b', 1);

    run(() => ref.quiz.submit());
    run(() => ref.quiz.startReview());
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

  it('keeps the correct answers locked through an incorrect-only retry', () => {
    const { ref, pick, run } = mountRemount(
      { ids: ['a', 'b'], hideOnResults: true },
      { graded: true, retryMode: 'incorrect-only' },
    );
    pick('a', 0);
    pick('b', 1);

    run(() => ref.quiz.submit());
    run(() => ref.quiz.retry());
    expect(ref.quiz.questions.map((q: any) => q.isLockedCorrect)).toEqual([
      true,
      false,
    ]);
    expect(ref.quiz.questions.map((q: any) => q.answer)).toEqual([
      0,
      undefined,
    ]);
  });

  it('takes each saved answer back when it remounts as the page opens', () => {
    const { ref } = mountRemount(
      { ids: ['a', 'b'], remountOnMount: true },
      { graded: true },
      {
        attempts: 1,
        score: 50,
        responses: new Map([
          ['a', ['0']],
          ['b', ['1']],
        ]),
      },
    );
    expect(ref.quiz.questions.map((q: any) => q.id)).toEqual(['a', 'b']);
    expect(ref.quiz.restored).toBe(false);
  });

  it('shows a rewritten id once the duplicate before it leaves', () => {
    const { target, ref, run } = mountRemount({ ids: ['x', 'x'] });
    const ids = () =>
      [...target.querySelectorAll('section')].map((s) =>
        s.getAttribute('data-question-id'),
      );
    expect(ids()).toEqual(['x', 'x-2']);

    run(() => ref.drop!(0));
    expect(ids()).toEqual(['x']);
  });
});
