// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import type { Interaction } from '../src/runtime/interaction.js';
import { flush } from './helpers.js';
import { mountInBody } from './helpers/mount.js';
import { setAdapterContext } from '../src/runtime/contexts.js';
import { setQuizContext } from '../src/runtime/hooks.svelte.js';

// Each built-in now registers with the parent `<Quiz>` via useQuestion. This
// suite mounts each one under a stub Quiz context, captures the registration
// payload, and asserts the emitted Interaction shape the real `<Quiz>` hands
// to the persistence adapter when the widget commits.

interface Registration {
  id: string;
  text: () => string | undefined;
  checkAnswer: () => boolean;
  interaction: () => Interaction;
  reset?: () => void;
}

function makeQuizCtx() {
  const registrations: Registration[] = [];
  const quiz: any = {
    registerQuestion(api: Registration) {
      registrations.push(api);
      return {
        id: api.id,
        submitted: false,
        correct: null,
        answer: undefined,
        feedbackVisible: false,
        locked: false,
        isLockedCorrect: false,
        render: undefined,
        setAnswer() {},
        setRender() {},
      };
    },
  };
  return { quiz, registrations };
}

function mountInQuiz(
  Component: any,
  props: Record<string, unknown>,
  quiz: any,
) {
  return mountInBody(Component, {
    props,
    setup: () => setQuizContext(quiz),
  });
}

describe('Built-in question components emit Interaction payloads in quiz mode', () => {
  it('MultipleChoice → { type: "choice", response, correct: [correctIndex] }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      MultipleChoice,
      { id: 'q1', question: 'Pick one', options: ['a', 'b', 'c'], correct: 1 },
      quiz,
    );

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const unanswered = reg.interaction();
    expect(unanswered).toEqual({
      type: 'choice',
      response: [],
      correct: ['1'],
      options: [
        { id: '0', text: 'a' },
        { id: '1', text: 'b' },
        { id: '2', text: 'c' },
      ],
    });
    expect(reg.id).toBe('q1');
  });

  it('MultipleChoice reports numeric options as text', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      MultipleChoice,
      { id: 'q2', question: '2 + 2?', options: [0, 4], correct: 1 },
      quiz,
    );

    const interaction = registrations[0].interaction();
    expect(interaction.type === 'choice' && interaction.options).toEqual([
      { id: '0', text: '0' },
      { id: '1', text: '4' },
    ]);
  });

  it('FillInTheBlank → { type: "fill-in", response, correct, caseMatters }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      FillInTheBlank,
      {
        id: 'q3',
        question: 'Capital of France',
        answers: ['Paris'],
        caseSensitive: false,
      },
      quiz,
    );

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    expect(reg.interaction()).toEqual({
      type: 'fill-in',
      response: '',
      correct: ['Paris'],
      caseMatters: false,
    });
    expect(reg.id).toBe('q3');
  });

  it('Matching → { type: "matching", response: pairs, correct: pairs }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Matching,
      {
        id: 'q4',
        question: 'Match these',
        pairs: [
          { left: 'Dog', right: 'Bark' },
          { left: 'Cat', right: 'Meow' },
        ],
      },
      quiz,
    );

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const ix = reg.interaction();
    expect(ix.type).toBe('matching');
    expect(ix).toMatchObject({
      type: 'matching',
      response: [],
      correct: [
        ['0', '0'],
        ['1', '1'],
      ],
      optionPairs: {
        left: [
          { id: '0', text: 'Dog' },
          { id: '1', text: 'Cat' },
        ],
        right: [
          { id: '0', text: 'Bark' },
          { id: '1', text: 'Meow' },
        ],
      },
    });
    expect(reg.id).toBe('q4');
  });

  it('Sorting → { type: "matching", response: [item,target] pairs, correct: pairs }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Sorting,
      {
        id: 'q5',
        question: 'Sort these',
        items: ['Apple', 'Broccoli'],
        targets: ['Fruit', 'Vegetable'],
        correct: [0, 1],
      },
      quiz,
    );

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const ix = reg.interaction();
    expect(ix.type).toBe('matching');
    expect(ix).toMatchObject({
      type: 'matching',
      response: [],
      correct: [
        ['0', '0'],
        ['1', '1'],
      ],
      optionPairs: {
        left: [
          { id: '0', text: 'Apple' },
          { id: '1', text: 'Broccoli' },
        ],
        right: [
          { id: '0', text: 'Fruit' },
          { id: '1', text: 'Vegetable' },
        ],
      },
    });
    expect(reg.id).toBe('q5');
  });

  it('Sorting maps each item to its own target, not to its own index', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Sorting,
      {
        id: 'q6',
        question: 'Sort these',
        items: ['Dog', 'Cat', 'Eagle', 'Salmon'],
        targets: ['Mammal', 'Bird', 'Fish'],
        correct: [0, 0, 1, 2],
      },
      quiz,
    );

    const ix = registrations[0].interaction();
    expect(ix).toMatchObject({
      type: 'matching',
      correct: [
        ['0', '0'],
        ['1', '0'],
        ['2', '1'],
        ['3', '2'],
      ],
    });
  });

  it('A Quiz-like round-trip: four built-ins all register with useful interaction payloads', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      MultipleChoice,
      { id: 'q7', question: 'Pick', options: ['a'], correct: 0 },
      quiz,
    );
    mountInQuiz(
      FillInTheBlank,
      { id: 'q8', question: 'Fill', answers: ['x'] },
      quiz,
    );
    mountInQuiz(
      Matching,
      { id: 'q9', question: 'Match', pairs: [{ left: 'a', right: 'A' }] },
      quiz,
    );
    mountInQuiz(
      Sorting,
      {
        id: 'q10',
        question: 'Sort',
        items: ['x'],
        targets: ['T'],
        correct: [0],
      },
      quiz,
    );

    expect(registrations).toHaveLength(4);
    expect(registrations[0].interaction().type).toBe('choice');
    expect(registrations[1].interaction().type).toBe('fill-in');
    expect(registrations[2].interaction().type).toBe('matching');
    expect(registrations[3].interaction().type).toBe('matching');
    expect(registrations.map((r) => r.text())).toEqual([
      'Pick',
      'Fill',
      'Match',
      'Sort',
    ]);
  });
});

describe('FillInTheBlank normalizes the response at the boundary', () => {
  async function answerAndSubmit(answers: string | string[], typed: string) {
    const reports: Array<[string, Interaction, boolean | null]> = [];
    const adapter = {
      reportInteraction: (id: string, i: Interaction, c: boolean | null) =>
        reports.push([id, i, c]),
    };
    const { target } = mountInBody(FillInTheBlank, {
      props: { id: 'q11', question: 'Q', answers },
      setup: () => setAdapterContext({ adapter } as any),
    });

    const input = target.querySelector('input') as HTMLInputElement;
    input.value = typed;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    (target.querySelector('button') as HTMLButtonElement).click();
    await flush();
    return { target, reports };
  }

  it('a trailing space scores correct and reports the trimmed response', async () => {
    const { target, reports } = await answerAndSubmit(
      ['blue', 'Blue'],
      'blue ',
    );

    expect(reports).toHaveLength(1);
    const [, interaction, correct] = reports[0];
    expect(interaction.response).toBe('blue');
    expect(correct).toBe(true);
    expect(
      target.querySelector('.tessera-question-result')?.className,
    ).toContain('correct');
  });

  it('shows and reports a single answer string as one answer', async () => {
    const { target, reports } = await answerAndSubmit('Paris', 'Lyon');

    expect(
      target.querySelector('.tessera-fitb-correct-answer')?.textContent,
    ).toBe('Correct answer: Paris');
    expect(reports[0][1]).toMatchObject({ correct: ['Paris'] });
  });

  it('shows and reports the trimmed, non-blank answers it grades against', async () => {
    const { target, reports } = await answerAndSubmit(
      [' Paris ', ' ', 'Lutetia'],
      'Lyon',
    );

    expect(
      target.querySelector('.tessera-fitb-correct-answer')?.textContent,
    ).toBe('Correct answers: Paris, Lutetia');
    expect(reports[0][1]).toMatchObject({ correct: ['Paris', 'Lutetia'] });
  });
});
