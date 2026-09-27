// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import type { Interaction } from '../src/runtime/interaction.js';
import { mountInBody } from './helpers/mount.js';

const settle = async () => {
  flushSync();
  await Promise.resolve();
};

// Each built-in now registers with the parent `<Quiz>` via useQuestion. This
// suite mounts each one under a stub Quiz context, captures the registration
// payload, and asserts the emitted Interaction shape the real `<Quiz>` hands
// to the persistence adapter when the widget commits.

interface Registration {
  id: string;
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
  quiz: unknown,
) {
  return mountInBody(Component, {
    props,
    context: new Map([['tessera-quiz', quiz]]),
  });
}

describe('Built-in question components emit Interaction payloads in quiz mode', () => {
  it('MultipleChoice → { type: "choice", response, correct: [correctIndex] }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      MultipleChoice,
      { question: 'Pick one', options: ['a', 'b', 'c'], correct: 1 },
      quiz,
    );

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const unanswered = reg.interaction();
    expect(unanswered).toEqual({
      type: 'choice',
      response: [],
      correct: ['1'],
    });
    expect(reg.id).toMatch(/^mc-/);
  });

  it('FillInTheBlank → { type: "fill-in", response, correct, caseMatters }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      FillInTheBlank,
      {
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
    expect(reg.id).toMatch(/^fitb-/);
  });

  it('Matching → { type: "matching", response: pairs, correct: pairs }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Matching,
      {
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
    });
    expect(reg.id).toMatch(/^matching-/);
  });

  it('Sorting → { type: "matching", response: [item,target] pairs, correct: pairs }', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Sorting,
      {
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
    });
    expect(reg.id).toMatch(/^sorting-/);
  });

  it('Sorting maps each item to its own target, not to its own index', () => {
    const { quiz, registrations } = makeQuizCtx();
    mountInQuiz(
      Sorting,
      {
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
      { question: 'Pick', options: ['a'], correct: 0 },
      quiz,
    );
    mountInQuiz(FillInTheBlank, { question: 'Fill', answers: ['x'] }, quiz);
    mountInQuiz(
      Matching,
      { question: 'Match', pairs: [{ left: 'a', right: 'A' }] },
      quiz,
    );
    mountInQuiz(
      Sorting,
      { question: 'Sort', items: ['x'], targets: ['T'], correct: [0] },
      quiz,
    );

    expect(registrations).toHaveLength(4);
    expect(registrations[0].interaction().type).toBe('choice');
    expect(registrations[1].interaction().type).toBe('fill-in');
    expect(registrations[2].interaction().type).toBe('matching');
    expect(registrations[3].interaction().type).toBe('matching');
  });
});

describe('FillInTheBlank normalizes the response at the boundary', () => {
  it('a trailing space scores correct and reports the trimmed response', async () => {
    const reports: Array<[string, Interaction, boolean | null]> = [];
    const adapter = {
      reportInteraction: (id: string, i: Interaction, c: boolean | null) =>
        reports.push([id, i, c]),
    };
    const { target } = mountInBody(FillInTheBlank, {
      props: { question: 'Sky colour', answers: ['blue', 'Blue'] },
      context: new Map([['tessera-adapter', { adapter }]]),
    });

    const input = target.querySelector('input') as HTMLInputElement;
    input.value = 'blue ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    (target.querySelector('button') as HTMLButtonElement).click();
    await settle();

    expect(reports).toHaveLength(1);
    const [, interaction, correct] = reports[0];
    expect(interaction.response).toBe('blue');
    expect(correct).toBe(true);
    expect(target.querySelector('.tessera-fitb-result')?.className).toContain(
      'correct',
    );
  });
});
