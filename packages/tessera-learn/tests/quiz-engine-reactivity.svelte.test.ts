// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import type { Interaction } from '../src/runtime/interaction.js';
import type { QuizConfig } from '../src/runtime/types.js';
import { QuizEngine } from '../src/runtime/quiz-engine.svelte.js';

function makeEngine(
  quizConfig: QuizConfig,
  restore: NonNullable<ConstructorParameters<typeof QuizEngine>[0]['restore']>,
) {
  return new QuizEngine({
    quizConfig,
    passingScore: () => 70,
    report: () => {},
    onComplete: () => {},
    restore,
  });
}

function register(engine: QuizEngine, ...ids: string[]) {
  for (const id of ids) {
    engine.registerQuestion({
      id,
      checkAnswer: () => true,
      interaction: (): Interaction => ({
        type: 'true-false',
        response: true,
        correct: true,
      }),
      restore: (response) => response,
    });
  }
}

// A shell that reads the quiz above `{@render children()}` reads it before any question registers.
function track<T>(read: () => T) {
  const seen: T[] = [];
  const cleanup = $effect.root(() => {
    $effect(() => {
      seen.push(read());
    });
  });
  flushSync();
  return { seen, cleanup };
}

describe('a drawn attempt read before its questions register', () => {
  it('enables Submit once a saved draw is answered', async () => {
    const engine = makeEngine(
      { graded: true, shuffle: true },
      { attempts: 0, score: 0, responses: new Map(), drawn: ['b', 'a'] },
    );
    const { seen, cleanup } = track(() => engine.canSubmit);

    register(engine, 'a', 'b');
    await Promise.resolve();
    engine.setAnswer(0, true);
    engine.setAnswer(1, true);
    flushSync();

    expect(seen.at(-1)).toBe(true);
    cleanup();
  });

  it('clears restored once every saved answer comes back', () => {
    const engine = makeEngine(
      { graded: true, shuffle: true },
      {
        attempts: 1,
        score: 100,
        responses: new Map([
          ['a', true],
          ['b', true],
        ]),
        questionIds: ['b', 'a'],
      },
    );
    const { seen, cleanup } = track(() => engine.restored);

    register(engine, 'a', 'b');
    flushSync();

    expect(seen.at(-1)).toBe(false);
    cleanup();
  });
});
