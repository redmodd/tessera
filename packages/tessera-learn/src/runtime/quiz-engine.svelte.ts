import { SvelteSet } from 'svelte/reactivity';
import type { Interaction } from './interaction.js';
import type { QuizConfig } from './types.js';
import {
  resolveFeedbackMode,
  resolveRetryStrategy,
  type QuizQuestionResult,
  type FeedbackModePredicate,
  type RetryStrategyPredicate,
} from './quiz-policy.js';
import type {
  UseQuizInternalHandle,
  UseQuizQuestionApi,
  QuestionInternal,
  Question,
} from './hooks.svelte.js';

/**
 * Dependencies injected into {@link QuizEngine} so the engine itself stays
 * framework- and DOM-free. The Svelte wrapper (`useQuiz`) provides the two
 * callbacks that bridge to the host element and the LMS adapter.
 */
export interface QuizEngineDeps {
  quizConfig: QuizConfig;
  /**
   * Live accessor for the resolved passing threshold (config + LMS mastery
   * override). Read on each access rather than captured, because the cmi5/SCORM
   * mastery override mutates `pageContext.passingScore` after `useQuiz()` may
   * already have run.
   */
  passingScore: () => number;
  /** Wraps `adapterCtx.adapter.reportInteraction`; a no-op when there is no adapter. */
  report: (
    id: string,
    interaction: Interaction,
    correct: boolean | null,
  ) => void;
  /**
   * Wraps the host-element `CustomEvent` dispatch. Returns `false` when the host
   * element is null (the engine treats that as "no LMS bridge listener").
   */
  dispatch: (name: string, detail?: unknown) => boolean;
}

interface InternalQuestion {
  id: string;
  weight: number;
  checkAnswer: (answer?: unknown) => boolean;
  reset?: () => void;
  complete?: () => boolean;
  interaction?: () => Interaction;
  render: unknown;
}

/**
 * The quiz engine: all reactive state, scoring, retry/feedback policy and the
 * register/submit/retry lifecycle that used to live inside the `useQuiz`
 * closure. Directly instantiable (and unit-testable) because the only two
 * side-effecting touchpoints — DOM events and LMS reporting — are injected.
 */
export class QuizEngine implements UseQuizInternalHandle {
  #deps: QuizEngineDeps;
  #feedbackPredicate: FeedbackModePredicate;
  #retryPredicate: RetryStrategyPredicate;
  #maxAttempts: number;

  #internalQuestions = $state<InternalQuestion[]>([]);
  #questionHandles = $state<QuestionInternal[]>([]);
  #answers = new Map<number, unknown>();
  #reportedAnswers = new Map<number, string>();
  #answersVersion = $state(0);
  #submitted = $state(false);
  #reviewing = $state(false);
  #score = $state(0);
  #attemptCount = $state(0);
  #submitCalled = false; // plain field, not $state — only the wrapper's onDestroy reads it
  #feedbackShown = new SvelteSet<number>();
  #lockedCorrect = new SvelteSet<number>();
  #seenIds = new Set<string>();

  constructor(deps: QuizEngineDeps) {
    this.#deps = deps;
    this.#maxAttempts = deps.quizConfig.maxAttempts ?? Infinity;
    this.#feedbackPredicate = resolveFeedbackMode(deps.quizConfig);
    this.#retryPredicate = resolveRetryStrategy(deps.quizConfig);
  }

  // Derived values are plain getters over $state, mirroring ProgressState (which
  // has no $derived). Getters recompute on read with or without a tracking
  // effect, so engine-construction tests need no $effect.root.
  get #totalQuestions(): number {
    return this.#internalQuestions.length;
  }

  get #allAnswered(): boolean {
    void this.#answersVersion;
    return (
      this.#totalQuestions > 0 &&
      this.#internalQuestions.every(
        (q, i) => this.#answers.has(i) && (q.complete?.() ?? true),
      )
    );
  }

  get state(): 'answering' | 'submitted' | 'reviewing' {
    return this.#reviewing
      ? 'reviewing'
      : this.#submitted
        ? 'submitted'
        : 'answering';
  }

  get questions(): ReadonlyArray<Question> {
    return this.#questionHandles;
  }

  get canSubmit(): boolean {
    return !this.#submitted && this.#allAnswered;
  }

  get canRetry(): boolean {
    return this.#submitted && this.#attemptCount < this.#maxAttempts;
  }

  get score(): number {
    return this.#score;
  }

  get passingScore(): number {
    return this.#deps.passingScore();
  }

  get attemptCount(): number {
    return this.#attemptCount;
  }

  /** Dev-warning inputs the wrapper reads in onDestroy. */
  get stats(): {
    questionsCount: number;
    answersCount: number;
    submitCalled: boolean;
  } {
    return {
      questionsCount: this.#internalQuestions.length,
      answersCount: this.#answers.size,
      submitCalled: this.#submitCalled,
    };
  }

  registerQuestion(api: UseQuizQuestionApi): QuestionInternal {
    if (this.#seenIds.has(api.id)) {
      console.warn(
        `[tessera] useQuiz: duplicate question id "${api.id}" — ` +
          'each question id must be unique within a quiz (LMS interaction records key by id).',
      );
    }
    this.#seenIds.add(api.id);
    const internal: InternalQuestion = {
      id: api.id,
      weight: typeof api.weight === 'number' && api.weight > 0 ? api.weight : 1,
      checkAnswer: api.checkAnswer,
      reset: api.reset,
      complete: api.complete,
      interaction: api.interaction,
      render: undefined,
    };
    this.#internalQuestions.push(internal);
    const handle = this.#makeQuestionHandle(this.#internalQuestions.length - 1);
    this.#questionHandles.push(handle);
    return handle;
  }

  setAnswer(index: number, answer: unknown): void {
    this.#answers.set(index, answer);
    this.#answersVersion++;
    this.#deps.dispatch('tessera-quiz-question-answered', { index });
  }

  getAnswer(index: number): unknown {
    void this.#answersVersion;
    return this.#answers.get(index);
  }

  setRender(index: number, render: unknown): void {
    if (this.#internalQuestions[index])
      this.#internalQuestions[index].render = render;
  }

  getRender(index: number): unknown {
    return this.#internalQuestions[index]?.render;
  }

  feedbackVisible(index: number): boolean {
    if (this.#deps.quizConfig.feedbackMode === 'never') return false;
    return this.#feedbackPredicate({
      questionIndex: index,
      submitted: this.#submitted,
      reviewing: this.#reviewing,
      hasAnswered: this.#answers.has(index),
      revealed: this.#feedbackShown.has(index),
      attemptCount: this.#attemptCount,
    });
  }

  revealFeedbackByIndex(index: number): void {
    if (this.#deps.quizConfig.feedbackMode === 'never') return;
    this.#feedbackShown.add(index);
  }

  isLockedCorrect(index: number): boolean {
    return this.#lockedCorrect.has(index);
  }

  revealFeedback(q: Question): void {
    const index = this.#internalQuestions.findIndex((iq) => iq.id === q.id);
    if (index >= 0) this.revealFeedbackByIndex(index);
  }

  submit(): void {
    this.#submitCalled = true;
    if (this.#submitted) return;
    if (!this.#allAnswered) return;
    // Combined null-host guard + before-submit dispatch: dispatch() returns false
    // when the host element is null, which is the silent-LMS-dropout case.
    if (!this.#deps.dispatch('tessera-quiz-before-submit')) {
      console.warn(
        '[tessera] useQuiz: submit() ran but the host element was null — no LMS bridge ' +
          'listener exists, so this score will not be persisted. Make sure your custom ' +
          'quiz shell binds the element it passes to useQuiz({ element: () => ... }).',
      );
      return;
    }

    for (let i = 0; i < this.#internalQuestions.length; i++) this.#commit(i);

    const { rounded } = this.#computeScore();
    this.#score = rounded;
    this.#submitted = true;
    this.#attemptCount++;

    this.#deps.dispatch('tessera-quiz-complete', { score: rounded });
  }

  startReview(): void {
    if (!this.#submitted) return;
    this.#reviewing = true;
  }

  exitReview(): void {
    this.#reviewing = false;
  }

  retry(): void {
    if (!this.canRetry) return;
    const results: QuizQuestionResult[] = [];
    for (let i = 0; i < this.#internalQuestions.length; i++) {
      const a = this.#answers.has(i) ? this.#answers.get(i) : undefined;
      results.push({
        interaction:
          this.#internalQuestions[i].interaction?.() ?? ({} as never),
        correct: this.#internalQuestions[i].checkAnswer(a),
        weight: this.#internalQuestions[i].weight,
      });
    }
    const newLocked = this.#retryPredicate(results);
    const preserved = new Map<number, unknown>();
    for (const i of newLocked) {
      if (this.#answers.has(i)) preserved.set(i, this.#answers.get(i));
    }
    this.#lockedCorrect.clear();
    for (const i of newLocked) this.#lockedCorrect.add(i);
    this.#answers.clear();
    this.#reportedAnswers.clear();
    for (const [i, a] of preserved) this.#answers.set(i, a);
    for (let i = 0; i < this.#internalQuestions.length; i++) {
      if (!newLocked.has(i) && this.#internalQuestions[i].reset)
        this.#internalQuestions[i].reset!();
    }
    this.#answersVersion++;
    this.#feedbackShown.clear();
    this.#submitted = false;
    this.#reviewing = false;
    this.#score = 0;
    this.#deps.dispatch('tessera-quiz-retry');
  }

  #commit(index: number): void {
    const q = this.#internalQuestions[index];
    if (!q || typeof q.interaction !== 'function') return;
    const interaction = q.interaction();
    if (!interaction) return;
    const fingerprint = JSON.stringify(interaction);
    if (this.#reportedAnswers.get(index) === fingerprint) return;
    const answer = this.#answers.has(index)
      ? this.#answers.get(index)
      : undefined;
    this.#deps.report(q.id, interaction, q.checkAnswer(answer));
    this.#reportedAnswers.set(index, fingerprint);
  }

  #computeScore(): { rounded: number; correctCount: number } {
    let weighted = 0;
    let totalWeight = 0;
    let correctCount = 0;
    for (let i = 0; i < this.#internalQuestions.length; i++) {
      const q = this.#internalQuestions[i];
      const a = this.#answers.has(i) ? this.#answers.get(i) : undefined;
      const ok = q.checkAnswer(a);
      totalWeight += q.weight;
      if (ok) {
        weighted += q.weight;
        correctCount++;
      }
    }
    if (totalWeight === 0) return { rounded: 0, correctCount: 0 };
    return {
      rounded: Math.round((weighted / totalWeight) * 100),
      correctCount,
    };
  }

  #makeQuestionHandle(i: number): QuestionInternal {
    const engine = this;
    return {
      get id() {
        return engine.#internalQuestions[i].id;
      },
      get submitted() {
        return engine.#submitted;
      },
      get correct() {
        if (!engine.#submitted) return null;
        const a = engine.#answers.has(i) ? engine.#answers.get(i) : undefined;
        return engine.#internalQuestions[i].checkAnswer(a);
      },
      get answer() {
        return engine.getAnswer(i);
      },
      get answerComplete() {
        return engine.#internalQuestions[i].complete?.() ?? true;
      },
      get feedbackVisible() {
        return engine.feedbackVisible(i);
      },
      get locked() {
        return (
          engine.#submitted ||
          engine.feedbackVisible(i) ||
          engine.isLockedCorrect(i)
        );
      },
      get isLockedCorrect() {
        return engine.isLockedCorrect(i);
      },
      get render() {
        return engine.getRender(i);
      },
      setAnswer(a: unknown) {
        engine.setAnswer(i, a);
      },
      commit() {
        engine.#commit(i);
      },
      setRender(r: unknown) {
        engine.setRender(i, r);
      },
    };
  }
}
