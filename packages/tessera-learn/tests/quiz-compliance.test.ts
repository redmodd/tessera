// @vitest-environment jsdom
/**
 * The compliance harness — Phase 5 Task 0 regression gate.
 *
 * Locks down two contracts produced by `useQuiz.submit()`:
 *
 *  1. `tessera-quiz-complete` event detail — `{ score }`. Score rollup is the
 *     LMS-facing signal that drives Pass/Fail.
 *  2. The exact sequence of `adapter.reportInteraction(id, interaction, correct)`
 *     calls produced as widgets `q.commit()` and as `submit()` flushes any
 *     uncommitted questions. Per-question writes to SCORM `cmi.interactions.*`
 *     and xAPI Answered statements are downstream of these calls — if this
 *     sequence stays stable, the existing per-adapter tests prove the LMS
 *     calls do too.
 *
 * Uses one of every SCORM 2004 4th Edition interaction type (RTE §4.2.7) so
 * the gate covers the full vocabulary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import HarnessSvelte from './fixtures/use-quiz-harness.svelte';
import { ALL_INTERACTION_FIXTURES } from './fixtures/all-interactions.js';
import type { Interaction } from '../src/runtime/interaction.js';
import type { UseQuizHandle } from '../src/runtime/hooks.svelte.js';

interface CompletionEvent {
  score: number;
}

interface HarnessRef {
  handle: UseQuizHandle | null;
  element: HTMLElement | null;
  events: CompletionEvent[];
  thrown: unknown;
}

type ReportCall = ['reportInteraction', string, Interaction, boolean];

function recordingAdapter(): {
  reportInteraction: (id: string, i: Interaction, c: boolean) => void;
  calls: ReportCall[];
} {
  const calls: ReportCall[] = [];
  return {
    calls,
    reportInteraction(id, interaction, correct) {
      calls.push(['reportInteraction', id, interaction, correct]);
    },
  };
}

function mountHarness(quizConfig: unknown, adapter: unknown) {
  const ref: HarnessRef = {
    handle: null,
    element: null,
    events: [],
    thrown: null,
  };
  const target = document.createElement('div');
  const host = document.createElement('div');
  target.appendChild(host);
  document.body.appendChild(target);
  const component = mount(HarnessSvelte, {
    target,
    props: { ref, quizConfig, host, adapter },
  });
  return { component, target, ref };
}

describe('Quiz orchestration → LMS bridge compliance', () => {
  const mountings: ReturnType<typeof mountHarness>[] = [];

  beforeEach(() => {
    mountings.length = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const m of mountings) {
      try {
        unmount(m.component);
      } catch {}
    }
    document.body.innerHTML = '';
  });

  function answerEveryFixture(adapter: ReturnType<typeof recordingAdapter>) {
    const m = mountHarness({ graded: true }, adapter);
    mountings.push(m);
    const q = m.ref.handle!;
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      q.setAnswer(i, '__answered__');
    }
    q.submit();
    expect(m.ref.events).toHaveLength(1);
    return m;
  }

  it('event detail carries only the rolled-up score', () => {
    const adapter = recordingAdapter();
    const m = answerEveryFixture(adapter);
    expect(m.ref.events[0]).toEqual({ score: 90 });
  });

  it('adapter reportInteraction calls are stable across all 10 interaction types', () => {
    const adapter = recordingAdapter();
    answerEveryFixture(adapter);
    expect(adapter.calls).toMatchInlineSnapshot(`
      [
        [
          "reportInteraction",
          "q-choice",
          {
            "correct": [
              "1",
            ],
            "response": [
              "1",
            ],
            "type": "choice",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-true-false",
          {
            "correct": true,
            "response": true,
            "type": "true-false",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-fill-in",
          {
            "caseMatters": false,
            "correct": [
              "Paris",
            ],
            "response": "paris",
            "type": "fill-in",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-long-fill-in",
          {
            "caseMatters": false,
            "correct": [
              "the canonical answer",
            ],
            "response": "a longer answer",
            "type": "long-fill-in",
          },
          false,
        ],
        [
          "reportInteraction",
          "q-matching",
          {
            "correct": [
              [
                "a",
                "A",
              ],
              [
                "b",
                "B",
              ],
            ],
            "response": [
              [
                "a",
                "A",
              ],
              [
                "b",
                "B",
              ],
            ],
            "type": "matching",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-sequencing",
          {
            "correct": [
              "1",
              "2",
              "3",
            ],
            "response": [
              "1",
              "2",
              "3",
            ],
            "type": "sequencing",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-numeric",
          {
            "correct": {
              "max": 45,
              "min": 40,
            },
            "response": 42,
            "type": "numeric",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-likert",
          {
            "correct": "agree",
            "response": "agree",
            "type": "likert",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-performance",
          {
            "correct": [
              [
                "step1",
                "do",
              ],
              [
                "step2",
                "next",
              ],
            ],
            "response": [
              [
                "step1",
                "do",
              ],
              [
                "step2",
                "next",
              ],
            ],
            "type": "performance",
          },
          true,
        ],
        [
          "reportInteraction",
          "q-other",
          {
            "correct": "x",
            "response": "x",
            "type": "other",
          },
          true,
        ],
      ]
    `);
  });

  it('retry: a second submit re-fires every reportInteraction', () => {
    // SCORM 1.2/2004 overwrite by id; cmi5 emits a second xAPI statement. The
    // contract is "every retry reports identically to the first attempt for
    // the same answers."
    const adapter = recordingAdapter();
    const m = mountHarness({ graded: true }, adapter);
    mountings.push(m);
    const q = m.ref.handle!;
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++)
      q.setAnswer(i, '__answered__');
    q.submit();
    expect(adapter.calls).toHaveLength(ALL_INTERACTION_FIXTURES.length);

    q.retry();
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++)
      q.setAnswer(i, '__answered__');
    q.submit();

    expect(m.ref.events).toHaveLength(2);
    expect(adapter.calls).toHaveLength(ALL_INTERACTION_FIXTURES.length * 2);
    const ids = adapter.calls.map((c) => c[1]);
    expect(ids.slice(0, ALL_INTERACTION_FIXTURES.length)).toEqual(
      ids.slice(ALL_INTERACTION_FIXTURES.length),
    );
  });

  it('default weights (=1) produce byte-identical adapter calls to the unweighted baseline', () => {
    // Locks in the "weight=1 is a no-op" promise.
    const adapter = recordingAdapter();
    const m = mountHarness({ graded: true }, adapter);
    mountings.push(m);
    const q = m.ref.handle!;
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        weight: 1,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++)
      q.setAnswer(i, '__answered__');
    q.submit();
    expect(adapter.calls).toHaveLength(ALL_INTERACTION_FIXTURES.length);
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      const f = ALL_INTERACTION_FIXTURES[i];
      expect(adapter.calls[i]).toEqual([
        'reportInteraction',
        f.id,
        f.interaction,
        f.expectedCorrect,
      ]);
    }
  });

  it('mixed weights leave per-question interactions identical (rollup score is covered in use-quiz)', () => {
    // Weights are not part of any LMS standard — a single question is still
    // pass/fail to the LMS regardless of its rollup weight. Only the rolled-up
    // score reflects the weighted formula.
    const adapter = recordingAdapter();
    const m = mountHarness({ graded: true }, adapter);
    mountings.push(m);
    const q = m.ref.handle!;
    const weights: Record<string, number> = { 'q-long-fill-in': 9 };
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        weight: weights[f.id] ?? 1,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++)
      q.setAnswer(i, '__answered__');
    q.submit();
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      const f = ALL_INTERACTION_FIXTURES[i];
      expect(adapter.calls[i]).toEqual([
        'reportInteraction',
        f.id,
        f.interaction,
        f.expectedCorrect,
      ]);
    }
  });
});
