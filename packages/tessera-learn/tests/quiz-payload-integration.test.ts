// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, createRawSnippet } from 'svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import type { Interaction } from '../src/runtime/interaction.js';

// Each built-in now registers with the parent `<Quiz>` via useQuestion. This
// suite mounts each one under a stub Quiz context, captures the registration
// payload, and asserts the emitted Interaction shape for the full round-trip
// the real `<Quiz>` relies on when building `tessera-quiz-complete`.

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

function mountWithContext(Component: any, props: Record<string, unknown>, ctx: unknown) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const context = new Map<string, unknown>([['tessera-quiz', ctx]]);
  const component = mount(Component, { target, props, context });
  return { component, target };
}

describe('Built-in question components emit Interaction payloads in quiz mode', () => {
  let toUnmount: any[] = [];

  beforeEach(() => {
    toUnmount = [];
  });

  afterEach(() => {
    for (const c of toUnmount) unmount(c);
    toUnmount = [];
    document.body.innerHTML = '';
  });

  it('MultipleChoice → { type: "choice", response, correct: [correctIndex] }', () => {
    const { quiz, registrations } = makeQuizCtx();
    const { component } = mountWithContext(
      MultipleChoice,
      { question: 'Pick one', options: ['a', 'b', 'c'], correct: 1 },
      quiz
    );
    toUnmount.push(component);

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const unanswered = reg.interaction();
    expect(unanswered).toEqual({ type: 'choice', response: [], correct: ['1'] });
    expect(reg.id).toMatch(/^mc-/);
  });

  it('FillInTheBlank → { type: "fill-in", response, correct, caseMatters }', () => {
    const { quiz, registrations } = makeQuizCtx();
    const { component } = mountWithContext(
      FillInTheBlank,
      { question: 'Capital of France', answers: ['Paris'], caseSensitive: false },
      quiz
    );
    toUnmount.push(component);

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
    const { component } = mountWithContext(
      Matching,
      {
        question: 'Match these',
        pairs: [
          { left: 'Dog', right: 'Bark' },
          { left: 'Cat', right: 'Meow' },
        ],
      },
      quiz
    );
    toUnmount.push(component);

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const ix = reg.interaction();
    expect(ix.type).toBe('matching');
    expect(ix).toMatchObject({
      type: 'matching',
      response: [],
      correct: [['0', '0'], ['1', '1']],
    });
    expect(reg.id).toMatch(/^matching-/);
  });

  it('Sorting → { type: "matching", response: [item,target] pairs, correct: pairs }', () => {
    const { quiz, registrations } = makeQuizCtx();
    const { component } = mountWithContext(
      Sorting,
      {
        question: 'Sort these',
        items: ['Apple', 'Broccoli'],
        targets: ['Fruit', 'Vegetable'],
        correct: [0, 1],
      },
      quiz
    );
    toUnmount.push(component);

    expect(registrations).toHaveLength(1);
    const reg = registrations[0];
    const ix = reg.interaction();
    expect(ix.type).toBe('matching');
    expect(ix).toMatchObject({
      type: 'matching',
      response: [],
      correct: [['0', '0'], ['1', '1']],
    });
    expect(reg.id).toMatch(/^sorting-/);
  });

  it('A Quiz-like round-trip: four built-ins all register with useful interaction payloads', () => {
    const { quiz, registrations } = makeQuizCtx();
    const mountings = [
      mountWithContext(MultipleChoice, { question: 'Pick', options: ['a'], correct: 0 }, quiz),
      mountWithContext(FillInTheBlank, { question: 'Fill', answers: ['x'] }, quiz),
      mountWithContext(
        Matching,
        { question: 'Match', pairs: [{ left: 'a', right: 'A' }] },
        quiz
      ),
      mountWithContext(
        Sorting,
        {
          question: 'Sort',
          items: ['x'],
          targets: ['T'],
          correct: [0],
        },
        quiz
      ),
    ];
    toUnmount.push(...mountings.map((m) => m.component));

    expect(registrations).toHaveLength(4);
    expect(registrations[0].interaction().type).toBe('choice');
    expect(registrations[1].interaction().type).toBe('fill-in');
    expect(registrations[2].interaction().type).toBe('matching');
    expect(registrations[3].interaction().type).toBe('matching');
  });
});
