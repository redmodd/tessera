// @vitest-environment jsdom
/**
 * The compliance harness — Phase 5 Task 0 regression gate.
 *
 * Two snapshots, both load-bearing:
 *
 *  1. `tessera-quiz-complete` event payload. This is the bridge between any
 *     quiz shell (built-in or custom) and the LMS-facing adapter. A custom
 *     quiz that doesn't populate `detail.interactions[]` correctly is silently
 *     broken on every LMS.
 *
 *  2. The exact sequence of `adapter.reportInteraction` / `adapter.setScore` /
 *     `adapter.setCompletionStatus` / `adapter.setSuccessStatus` calls
 *     produced by piping that payload through `App.svelte`'s bridge handler.
 *     Per-question writes to SCORM `cmi.interactions.*` and xAPI statements
 *     are downstream of these calls — if this sequence stays stable, the
 *     existing per-adapter tests prove the LMS calls do too.
 *
 * Both snapshots use one of every SCORM 2004 4th Edition interaction type
 * (RTE §4.2.7) so the gate covers the full vocabulary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import HarnessSvelte from './fixtures/use-quiz-harness.svelte';
import { ALL_INTERACTION_FIXTURES } from './fixtures/all-interactions.js';
import type { Interaction } from '../src/runtime/interaction.js';
import type { PersistenceAdapter, SavedState } from '../src/runtime/persistence.js';
import type { UseQuizHandle } from '../src/runtime/hooks.svelte.js';

interface CompletionEvent {
  score: number;
  interactions: Array<{ id: string; interaction: Interaction; correct: boolean }>;
}

interface HarnessRef {
  handle: UseQuizHandle | null;
  element: HTMLElement | null;
  events: CompletionEvent[];
  thrown: unknown;
}

function mountHarness(quizConfig: unknown) {
  const ref: HarnessRef = { handle: null, element: null, events: [], thrown: null };
  const target = document.createElement('div');
  const host = document.createElement('div');
  target.appendChild(host);
  document.body.appendChild(target);
  const component = mount(HarnessSvelte, { target, props: { ref, quizConfig, host } });
  return { component, target, ref };
}

/**
 * Records every adapter method invocation in order. Matches App.svelte's
 * bridge contract: reportInteraction(id, interaction, correct) per question,
 * then setScore + setCompletionStatus + setSuccessStatus on rollup.
 */
function recordingAdapter(): PersistenceAdapter & { calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = [];
  const record = (method: string) =>
    (...args: unknown[]) => {
      calls.push([method, ...args]);
    };
  return {
    calls,
    async init() { calls.push(['init']); },
    getState(): SavedState | null { return null; },
    saveState: record('saveState') as PersistenceAdapter['saveState'],
    setScore: record('setScore') as PersistenceAdapter['setScore'],
    setCompletionStatus: record('setCompletionStatus') as PersistenceAdapter['setCompletionStatus'],
    setSuccessStatus: record('setSuccessStatus') as PersistenceAdapter['setSuccessStatus'],
    setDuration: record('setDuration') as PersistenceAdapter['setDuration'],
    setExit: record('setExit') as PersistenceAdapter['setExit'],
    reportInteraction: record('reportInteraction') as PersistenceAdapter['reportInteraction'],
    commit: record('commit') as PersistenceAdapter['commit'],
    terminate: record('terminate') as PersistenceAdapter['terminate'],
  };
}

/**
 * Replays App.svelte's `handleQuizComplete` against the recording adapter.
 * Kept tiny on purpose — the bridge logic in App.svelte is also tiny, and
 * the point of this harness is to lock down the contract between the two.
 */
function runBridge(adapter: PersistenceAdapter, payload: CompletionEvent, opts: { passed: boolean }) {
  for (const { id, interaction, correct } of payload.interactions) {
    adapter.reportInteraction(id, interaction, correct);
  }
  adapter.setScore(payload.score);
  adapter.setSuccessStatus(opts.passed ? 'passed' : 'failed');
  adapter.setCompletionStatus('complete');
  adapter.commit();
}

describe('Quiz orchestration → LMS bridge compliance', () => {
  const mountings: ReturnType<typeof mountHarness>[] = [];

  beforeEach(() => {
    mountings.length = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const m of mountings) {
      try { unmount(m.component); } catch {}
    }
    document.body.innerHTML = '';
  });

  function answerEveryFixture(): CompletionEvent {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        // The fixtures already pair each response with the matching `correct`
        // pattern, so isCorrect() resolves the same way for every adapter.
        // The harness publishes both halves so checkAnswer() and interaction()
        // agree about which answer the learner gave.
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      // The hook only gates submit() on `answers.size >= totalQuestions`; a
      // sentinel value is enough to count.
      q.setAnswer(i, '__answered__');
    }
    q.submit();
    expect(m.ref.events).toHaveLength(1);
    return m.ref.events[0];
  }

  it('event payload is stable across all 10 interaction types', () => {
    const payload = answerEveryFixture();
    expect(payload).toMatchInlineSnapshot(`
      {
        "interactions": [
          {
            "correct": true,
            "id": "q-choice",
            "interaction": {
              "correct": [
                "1",
              ],
              "response": [
                "1",
              ],
              "type": "choice",
            },
          },
          {
            "correct": true,
            "id": "q-true-false",
            "interaction": {
              "correct": true,
              "response": true,
              "type": "true-false",
            },
          },
          {
            "correct": true,
            "id": "q-fill-in",
            "interaction": {
              "caseMatters": false,
              "correct": [
                "Paris",
              ],
              "response": "paris",
              "type": "fill-in",
            },
          },
          {
            "correct": false,
            "id": "q-long-fill-in",
            "interaction": {
              "caseMatters": false,
              "correct": [
                "the canonical answer",
              ],
              "response": "a longer answer",
              "type": "long-fill-in",
            },
          },
          {
            "correct": true,
            "id": "q-matching",
            "interaction": {
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
          },
          {
            "correct": true,
            "id": "q-sequencing",
            "interaction": {
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
          },
          {
            "correct": true,
            "id": "q-numeric",
            "interaction": {
              "correct": {
                "max": 45,
                "min": 40,
              },
              "response": 42,
              "type": "numeric",
            },
          },
          {
            "correct": true,
            "id": "q-likert",
            "interaction": {
              "correct": "agree",
              "response": "agree",
              "type": "likert",
            },
          },
          {
            "correct": true,
            "id": "q-performance",
            "interaction": {
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
          },
          {
            "correct": true,
            "id": "q-other",
            "interaction": {
              "correct": "x",
              "response": "x",
              "type": "other",
            },
          },
        ],
        "score": 90,
      }
    `);
  });

  it('retry: a second submit redispatches the full event payload (and the bridge re-fires every reportInteraction)', () => {
    // Phase 5 review #13 — the original harness only snapshotted the first
    // submission, leaving retry behavior unverified. SCORM 1.2/2004 overwrite
    // by id; cmi5 emits a second xAPI statement. The contract is "every retry
    // reports identically to the first attempt for the same answers," and the
    // event payload + adapter sequence are the chokepoint that proves it.
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) q.setAnswer(i, '__answered__');
    q.submit();
    expect(m.ref.events).toHaveLength(1);
    const firstScore = m.ref.events[0].score;
    const firstInteractions = m.ref.events[0].interactions;

    // Second attempt — same answers (the harness's checkAnswer/interaction
    // closures don't depend on setAnswer values, so the second submit reports
    // the exact same payload as the first).
    q.retry();
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) q.setAnswer(i, '__answered__');
    q.submit();

    expect(m.ref.events).toHaveLength(2);
    expect(m.ref.events[1].score).toBe(firstScore);
    expect(m.ref.events[1].interactions).toEqual(firstInteractions);

    // Bridge replay: the adapter must see two full per-question batches in
    // order. Per-attempt overwriting/append behavior is the adapter's
    // responsibility (covered by scorm12/2004/cmi5 unit tests).
    const adapter = recordingAdapter();
    runBridge(adapter, m.ref.events[0], { passed: m.ref.events[0].score >= 70 });
    runBridge(adapter, m.ref.events[1], { passed: m.ref.events[1].score >= 70 });
    const reportCalls = adapter.calls.filter(([m]) => m === 'reportInteraction');
    expect(reportCalls).toHaveLength(ALL_INTERACTION_FIXTURES.length * 2);
    // Per-question id ordering matches between attempt 1 and attempt 2.
    const ids = reportCalls.map((c) => c[1]);
    expect(ids.slice(0, ALL_INTERACTION_FIXTURES.length)).toEqual(
      ids.slice(ALL_INTERACTION_FIXTURES.length)
    );
  });

  it('default weights (=1) produce byte-identical adapter calls to the pre-Task 4 baseline', () => {
    // Phase 5 Task 4 Step 3 fixture #1. Registering with `weight: 1` on every
    // question must produce the exact same adapter sequence as the unweighted
    // baseline above. Locks in the "weight=1 is a no-op" promise.
    const m = mountHarness({ graded: true });
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
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) q.setAnswer(i, '__answered__');
    q.submit();
    expect(m.ref.events).toHaveLength(1);
    const adapter = recordingAdapter();
    runBridge(adapter, m.ref.events[0], { passed: m.ref.events[0].score >= 70 });
    // Score in the unweighted baseline above: 90. With weight=1 everywhere it
    // must be the same, and per-question reportInteraction args must also match.
    expect(m.ref.events[0].score).toBe(90);
    const reportCalls = adapter.calls.filter(([m]) => m === 'reportInteraction');
    expect(reportCalls).toHaveLength(ALL_INTERACTION_FIXTURES.length);
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      const f = ALL_INTERACTION_FIXTURES[i];
      expect(reportCalls[i]).toEqual(['reportInteraction', f.id, f.interaction, f.expectedCorrect]);
    }
  });

  it('mixed weights change setScore but leave per-question interactions identical', () => {
    // Phase 5 Task 4 Step 3 fixture #2. Weights are not part of any LMS
    // standard — a single question is still pass/fail to the LMS regardless of
    // its rollup weight. Only setScore reflects the weighted formula.
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    // Heavy weight on the one wrong answer (q-long-fill-in) flips the score
    // below the unweighted 90 / above-passing baseline.
    const weights: Record<string, number> = { 'q-long-fill-in': 9 };
    for (const f of ALL_INTERACTION_FIXTURES) {
      q.registerQuestion({
        id: f.id,
        weight: weights[f.id] ?? 1,
        checkAnswer: () => f.expectedCorrect,
        interaction: () => f.interaction,
      });
    }
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) q.setAnswer(i, '__answered__');
    q.submit();
    expect(m.ref.events).toHaveLength(1);
    const payload = m.ref.events[0];
    // Σ(w·correct) / Σ(w) × 100 = (9 correct × 1 + 0 × 9) / (9 × 1 + 9) × 100 = 50
    expect(payload.score).toBe(50);
    const adapter = recordingAdapter();
    runBridge(adapter, payload, { passed: payload.score >= 70 });
    // Per-question content unchanged from the unweighted baseline.
    const reportCalls = adapter.calls.filter(([m]) => m === 'reportInteraction');
    for (let i = 0; i < ALL_INTERACTION_FIXTURES.length; i++) {
      const f = ALL_INTERACTION_FIXTURES[i];
      expect(reportCalls[i]).toEqual(['reportInteraction', f.id, f.interaction, f.expectedCorrect]);
    }
    // Only setScore + setSuccessStatus differ from the baseline.
    const setScoreCall = adapter.calls.find(([m]) => m === 'setScore');
    expect(setScoreCall).toEqual(['setScore', 50]);
    const setSuccessCall = adapter.calls.find(([m]) => m === 'setSuccessStatus');
    expect(setSuccessCall).toEqual(['setSuccessStatus', 'failed']);
  });

  it('adapter call sequence (App.svelte bridge) is stable across all 10 interaction types', () => {
    const payload = answerEveryFixture();
    const adapter = recordingAdapter();
    runBridge(adapter, payload, { passed: payload.score >= 70 });
    // The shape that matters: 10 reportInteraction calls in fixture order,
    // then a single setScore / setSuccessStatus / setCompletionStatus / commit.
    // Per-call args are snapshotted so any drift in the contract is loud.
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
        [
          "setScore",
          90,
        ],
        [
          "setSuccessStatus",
          "passed",
        ],
        [
          "setCompletionStatus",
          "complete",
        ],
        [
          "commit",
        ],
      ]
    `);
  });
});
