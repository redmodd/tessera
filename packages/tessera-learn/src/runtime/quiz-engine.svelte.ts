import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { normalizeWeight, weightedScore } from './progress.svelte.js';
import { restoreResponse, type Interaction } from './interaction.js';
import type { QuizConfig } from './types.js';
import type {
  UseQuizHandle,
  UseQuizQuestionApi,
  UseQuestionHandle,
  Question,
} from './hooks.svelte.js';

/**
 * Dependencies injected into {@link QuizEngine} so the engine itself stays
 * framework- and DOM-free. The Svelte wrapper (`useQuiz`) provides the
 * callbacks that bridge to progress tracking and the LMS adapter.
 */
export interface QuizEngineDeps {
  quizConfig: QuizConfig;
  /**
   * Live accessor for the resolved passing threshold (config + LMS mastery
   * override). Read on each access rather than captured, because the cmi5/SCORM
   * mastery override lands after `useQuiz()` may already have run.
   */
  passingScore: () => number;
  /** Wraps `adapterCtx.adapter.reportInteraction`; a no-op when there is no adapter. */
  report: (
    id: string,
    interaction: Interaction,
    correct: boolean | null,
  ) => void;
  /** Records the submitted score and responses against the current page's progress. */
  onComplete: (score: number, responses: Map<string, unknown>) => void;
  /** Author-facing DOM notification; a no-op unless the shell supplies an element. */
  notify?: (name: string, detail?: unknown) => void;
  /**
   * Saved attempt count, best score and that attempt's answers for this quiz
   * page. With attempts > 0 the engine starts in the results phase, and can
   * review them once every question has taken its answer back: see
   * {@link QuizEngine.restored}.
   */
  restore?: {
    attempts: number;
    score: number;
    answers?: ReadonlyMap<string, unknown>;
  };
}

interface InternalQuestion {
  id: string;
  weight: number;
  checkAnswer: () => boolean;
  reset?: () => void;
  complete?: () => boolean;
  interaction?: () => Interaction | undefined;
  restore?: UseQuizQuestionApi['restore'];
  render: unknown;
}

/**
 * The quiz engine: all reactive state, scoring, retry/feedback policy and the
 * register/submit/retry lifecycle. Directly instantiable (and unit-testable)
 * because the side-effecting touchpoints — progress, LMS reporting and the
 * author-facing DOM notification — are injected.
 */
export class QuizEngine implements UseQuizHandle {
  #deps: QuizEngineDeps;
  #maxAttempts: number;

  #internalQuestions = $state<InternalQuestion[]>([]);
  #questionHandles = $state.raw<UseQuestionHandle[]>([]);
  #answers = new SvelteMap<number, unknown>();
  #reportedAnswers = new Map<number, string>();
  #submitted = $state(false);
  #reviewing = $state(false);
  #score = $state(0);
  #bestScore = $state(0);
  #attemptCount = $state(0);
  #fromSave = $state(false);
  #restoredCount = $state(0);
  #submitCalled = false; // plain field, not $state — only the wrapper's onDestroy reads it
  #feedbackShown = new SvelteSet<number>();
  #lockedCorrect = new SvelteSet<number>();
  // Each handle carries its index under this symbol, so a proxied copy resolves too.
  #indexKey = Symbol('tessera.questionIndex');
  #seenIds = new Set<string>();
  #rewrittenIds = new Set<string>();

  constructor(deps: QuizEngineDeps) {
    this.#deps = deps;
    this.#maxAttempts = deps.quizConfig.maxAttempts ?? Infinity;
    if (deps.restore && deps.restore.attempts > 0) {
      this.#attemptCount = deps.restore.attempts;
      this.#score = deps.restore.score;
      this.#bestScore = deps.restore.score;
      this.#submitted = true;
      this.#fromSave = true;
      this.#submitCalled = true;
    }
  }

  // Derived values are plain getters over $state, mirroring ProgressState (which
  // has no $derived). Getters recompute on read with or without a tracking
  // effect, so engine-construction tests need no $effect.root.
  get #totalQuestions(): number {
    return this.#internalQuestions.length;
  }

  #answerComplete(i: number): boolean {
    return (
      this.#answers.has(i) && (this.#internalQuestions[i].complete?.() ?? true)
    );
  }

  get #allAnswered(): boolean {
    return (
      this.#totalQuestions > 0 &&
      this.#internalQuestions.every((_, i) => this.#answerComplete(i))
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

  get bestScore(): number {
    return this.#bestScore;
  }

  get passingScore(): number {
    return this.#deps.passingScore();
  }

  get attemptCount(): number {
    return this.#attemptCount;
  }

  get restored(): boolean {
    return (
      this.#fromSave &&
      !(
        this.#totalQuestions > 0 && this.#restoredCount === this.#totalQuestions
      )
    );
  }

  get feedbackMode(): NonNullable<QuizConfig['feedbackMode']> {
    return this.#deps.quizConfig.feedbackMode ?? 'review';
  }

  get maxAttempts(): number {
    return this.#maxAttempts;
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

  registerQuestion(api: UseQuizQuestionApi): UseQuestionHandle {
    let id = api.id;
    if (this.#seenIds.has(id)) {
      let n = 2;
      while (this.#seenIds.has(`${api.id}-${n}`)) n++;
      id = `${api.id}-${n}`;
      console.warn(
        this.#rewrittenIds.has(api.id)
          ? `[tessera] useQuiz: question id "${api.id}" is already taken by an earlier question whose ` +
              `duplicate id was rewritten to it — registered as "${id}" instead. ` +
              'Give the earlier duplicates explicit ids, because the rewritten one is the key ' +
              "this question's LMS interaction is recorded under."
          : `[tessera] useQuiz: duplicate question id "${api.id}" — registered as "${id}" instead. ` +
              'Each question id must be unique within a quiz; give this question an explicit id, ' +
              'because the rewritten one is the key its LMS interaction is recorded under.',
      );
      this.#rewrittenIds.add(id);
    }
    this.#seenIds.add(id);
    const internal: InternalQuestion = {
      id,
      weight: normalizeWeight(api.weight),
      checkAnswer: api.checkAnswer,
      reset: api.reset,
      complete: api.complete,
      interaction: api.interaction,
      restore: api.restore,
      render: undefined,
    };
    this.#internalQuestions.push(internal);
    const index = this.#internalQuestions.length - 1;
    const answer = this.#fromSave
      ? restoreResponse(internal, this.#deps.restore?.answers?.get(id))
      : undefined;
    if (answer !== undefined) {
      this.#answers.set(index, answer);
      this.#restoredCount++;
    } else if (this.#fromSave) {
      // `restored` is now true, and a review of it would judge nothing.
      this.#reviewing = false;
    }
    const handle = this.#makeQuestionHandle(index);
    this.#questionHandles = [...this.#questionHandles, handle];
    return handle;
  }

  setAnswer(index: number, answer: unknown): void {
    this.#answers.set(index, answer);
  }

  getAnswer(index: number): unknown {
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
    const mode = this.feedbackMode;
    if (mode === 'never') return false;
    if (this.#reviewing) return true;
    return mode === 'immediate' && this.#feedbackShown.has(index);
  }

  revealFeedbackByIndex(index: number): void {
    if (this.feedbackMode === 'never') return;
    this.#feedbackShown.add(index);
  }

  isLockedCorrect(index: number): boolean {
    return this.#lockedCorrect.has(index);
  }

  revealFeedback(q: Question): void {
    const index = (q as unknown as Record<symbol, unknown>)[this.#indexKey];
    if (typeof index === 'number') this.revealFeedbackByIndex(index);
  }

  submit(): void {
    this.#submitCalled = true;
    if (this.#submitted || this.#totalQuestions === 0) return;
    if (!this.#allAnswered) {
      console.warn(
        '[tessera] useQuiz: submit() ran with an unanswered or half-built question, ' +
          'so nothing was scored. Gate your Submit button on handle.canSubmit.',
      );
      return;
    }

    for (let i = 0; i < this.#internalQuestions.length; i++) this.#commit(i);

    const score = this.#computeScore();
    this.#score = score;
    this.#bestScore = Math.max(this.#bestScore, score);
    this.#submitted = true;
    this.#fromSave = false;
    this.#attemptCount++;

    const responses = new Map<string, unknown>();
    for (const q of this.#internalQuestions) {
      if (!q.restore) continue;
      const response = q.interaction?.()?.response;
      if (response !== undefined) responses.set(q.id, response);
    }
    this.#deps.onComplete(score, responses);
    this.#deps.notify?.('tessera-quiz-complete', { score });
  }

  startReview(): void {
    if (!this.#submitted) return;
    if (this.restored) {
      console.warn(
        '[tessera] useQuiz: startReview() did nothing because these results were ' +
          'restored from saved progress without their answers. ' +
          'Hide your Review control when handle.restored is true.',
      );
      return;
    }
    this.#reviewing = true;
  }

  exitReview(): void {
    this.#reviewing = false;
  }

  retry(): void {
    if (!this.canRetry) return;
    const newLocked = new Set<number>();
    if (this.#deps.quizConfig.retryMode === 'incorrect-only') {
      this.#internalQuestions.forEach((q, i) => {
        if (q.checkAnswer()) newLocked.add(i);
      });
    }
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
    this.#feedbackShown.clear();
    this.#submitted = false;
    this.#fromSave = false;
    this.#reviewing = false;
    this.#score = 0;
  }

  #commit(index: number): void {
    const q = this.#internalQuestions[index];
    if (!q || typeof q.interaction !== 'function') return;
    const interaction = q.interaction();
    if (!interaction) return;
    const fingerprint = JSON.stringify(interaction);
    if (this.#reportedAnswers.get(index) === fingerprint) return;
    this.#deps.report(q.id, interaction, q.checkAnswer());
    this.#reportedAnswers.set(index, fingerprint);
  }

  #computeScore(): number {
    return weightedScore(
      this.#internalQuestions.map((q) => ({
        score: q.checkAnswer() ? 100 : 0,
        weight: q.weight,
      })),
    );
  }

  #makeQuestionHandle(i: number): UseQuestionHandle {
    const engine = this;
    return {
      [engine.#indexKey]: i,
      get id() {
        return engine.#internalQuestions[i].id;
      },
      get submitted() {
        return engine.#submitted;
      },
      get correct() {
        if (engine.restored) return null;
        if (!engine.#submitted && !engine.feedbackVisible(i)) return null;
        return engine.#internalQuestions[i].checkAnswer();
      },
      get answer() {
        return engine.getAnswer(i);
      },
      get answerComplete() {
        return engine.#answerComplete(i);
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
      submit() {},
      retry() {},
      reset() {
        engine.#internalQuestions[i].reset?.();
      },
      canRetry: false,
      retryCount: 0,
      mode: 'quiz',
    };
  }
}
