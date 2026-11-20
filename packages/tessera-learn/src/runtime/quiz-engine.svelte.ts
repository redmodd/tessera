import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { normalizeWeight, scoredMean } from './progress.svelte.js';
import { restoreResponse, type Interaction } from './interaction.js';
import {
  drawGroups,
  drawShortfalls,
  poolProblem,
  type QuizConfig,
} from './types.js';
import type { QuizPageState } from './contexts.js';
import { shuffle } from '../components/util.js';
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
    text?: string,
  ) => void;
  /** Records the submitted score and responses against the current page's progress. */
  onComplete: (
    score: number,
    responses: Map<string, unknown>,
    scored: boolean,
    questionIds?: string[],
  ) => void;
  /** Keeps a fresh draw until it is submitted, so leaving the page can't redraw it. */
  onDraw?: (questionIds: readonly string[]) => void;
  /** Author-facing DOM notification; a no-op unless the shell supplies an element. */
  notify?: (name: string, detail?: unknown) => void;
  /**
   * Saved attempt count, best score and that attempt's responses and
   * question ids for this quiz page. With attempts > 0 the engine starts in
   * the results phase, and can review them once every question has taken its
   * answer back: see {@link QuizEngine.restored}.
   */
  restore?: QuizPageState;
}

type InternalQuestion = UseQuizQuestionApi & {
  weight: number;
  render: unknown;
};

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
  #scored = $state(true);
  #bestScored = true;
  #attemptCount = $state(0);
  #fromSave = $state(false);
  #answerMissing = $state(false);
  #submitCalled = false; // plain field, not $state — only the wrapper's onDestroy reads it
  #feedbackShown = new SvelteSet<number>();
  #lockedCorrect = new SvelteSet<number>();
  // Each handle carries its index under this symbol, so a proxied copy resolves too.
  #indexKey = Symbol('tessera.questionIndex');
  #rewrittenIds = new Set<string>();
  #indexById = new SvelteMap<string, number>();
  // The attempt's question ids in order; null when every registered question
  // is in it, in page order (no `draw` or `shuffle`).
  #attemptIds = $state.raw<readonly string[] | null>(null);
  #drawQueued = false;
  #savedDraw: readonly string[] | null = null;
  #persistedDraw: readonly string[] | null = null;
  #poolsChecked = false;

  constructor(deps: QuizEngineDeps) {
    this.#deps = deps;
    this.#maxAttempts = deps.quizConfig.maxAttempts ?? Infinity;
    if (deps.restore && deps.restore.attempts > 0) {
      this.#attemptCount = deps.restore.attempts;
      this.#score = deps.restore.score;
      this.#bestScore = deps.restore.score;
      this.#scored = !deps.restore.unscored;
      this.#bestScored = this.#scored;
      this.#submitted = true;
      this.#fromSave = true;
      this.#submitCalled = true;
    }
    if (deps.quizConfig.draw != null || deps.quizConfig.shuffle) {
      this.#savedDraw = deps.restore?.drawn?.length ? deps.restore.drawn : null;
      this.#persistedDraw = this.#savedDraw;
      this.#attemptIds =
        (this.#fromSave ? deps.restore?.questionIds : this.#savedDraw) ?? [];
    }
  }

  // Derived values are plain getters over $state, not $derived. Getters
  // recompute on read with or without a tracking effect, so
  // engine-construction tests need no $effect.root.
  get #attempt(): number[] {
    if (!this.#attemptIds) return this.#questionHandles.map((_, i) => i);
    return this.#attemptIds.flatMap((id) => {
      const i = this.#indexById.get(id);
      return i === undefined ? [] : [i];
    });
  }

  #inAttempt(i: number): boolean {
    return (
      !this.#attemptIds ||
      this.#attemptIds.includes(this.#internalQuestions[i].id)
    );
  }

  #answerComplete(i: number): boolean {
    return (
      this.#answers.has(i) && (this.#internalQuestions[i].complete?.() ?? true)
    );
  }

  get #allAnswered(): boolean {
    const attempt = this.#attempt;
    return attempt.length > 0 && attempt.every((i) => this.#answerComplete(i));
  }

  get state(): 'answering' | 'submitted' | 'reviewing' {
    return this.#reviewing
      ? 'reviewing'
      : this.#submitted
        ? 'submitted'
        : 'answering';
  }

  get questions(): ReadonlyArray<Question> {
    const handles = this.#questionHandles;
    return this.#attemptIds ? this.#attempt.map((i) => handles[i]) : handles;
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

  get scored(): boolean {
    return this.#scored;
  }

  get passingScore(): number {
    return this.#deps.passingScore();
  }

  get attemptCount(): number {
    return this.#attemptCount;
  }

  get restored(): boolean {
    return this.#fromSave && (this.#questionMissing || this.#answerMissing);
  }

  /** The save kept no questions, or one of its attempt never registered. */
  get #questionMissing(): boolean {
    const attempt = this.#attempt;
    return (
      attempt.length === 0 || attempt.length < (this.#attemptIds?.length ?? 0)
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
    registeredCount: number;
    questionsCount: number;
    answersCount: number;
    submitCalled: boolean;
  } {
    const attempt = this.#attempt;
    return {
      registeredCount: this.#internalQuestions.length,
      questionsCount: attempt.length,
      answersCount: attempt.filter((i) => this.#answers.has(i)).length,
      submitCalled: this.#submitCalled,
    };
  }

  /**
   * The saved draw while it is still a draw of the questions registered now,
   * else a new one. With none registered yet (a shell that renders them
   * later), the draw waits for them.
   */
  #drawAttempt(): void {
    if (this.#indexById.size === 0) {
      this.#attemptIds = [];
      return;
    }
    const saved = this.#savedDraw;
    const ids = saved && this.#fitsDraw(saved) ? saved : this.#draw();
    this.#attemptIds = ids;
    if (ids === this.#persistedDraw) return;
    this.#persistedDraw = ids;
    this.#deps.onDraw?.(ids);
  }

  #drawGroups() {
    return drawGroups(
      this.#deps.quizConfig.draw,
      this.#internalQuestions,
      (q) => q.pool,
    );
  }

  /**
   * Whether `ids` holds what {@link #draw} would pick from the questions
   * registered now: a draw saved before a shell rendered its other questions
   * holds too few.
   */
  #fitsDraw(ids: readonly string[]): boolean {
    if (!ids.every((id) => this.#indexById.has(id))) return false;
    const drawn = new Set(ids);
    return this.#drawGroups().every(
      ({ count, members }) =>
        members.filter((q) => drawn.has(q.id)).length ===
        Math.min(count, members.length),
    );
  }

  /** An answer to a question outside the attempt doesn't start it. */
  get #started(): boolean {
    return this.#submitted || this.#attempt.some((i) => this.#answers.has(i));
  }

  /**
   * Draws once every question registering in this update has, whether the
   * page renders them at mount or a shell renders them later (behind a Start
   * button, say). After the learner answers one, a late question stays out.
   */
  #queueDraw(id: string): void {
    if (this.#started) {
      if (import.meta.env?.DEV) {
        console.warn(
          `[tessera] useQuiz: question "${id}" registered after the learner started ` +
            'the attempt, so it is left out of it. Render every question before the ' +
            'learner answers one, not inside {#await}, a lazy import or an {#if} they toggle.',
        );
      }
      return;
    }
    if (this.#drawQueued) return;
    this.#drawQueued = true;
    queueMicrotask(() => {
      this.#drawQueued = false;
      if (this.#started) return;
      this.#drawAttempt();
    });
  }

  #draw(): string[] {
    let picked = this.#drawGroups().flatMap(({ count, members }) =>
      count < members.length ? shuffle(members).slice(0, count) : members,
    );
    if (this.#deps.quizConfig.shuffle) picked = shuffle(picked);
    else {
      const chosen = new Set(picked);
      picked = this.#internalQuestions.filter((q) => chosen.has(q));
    }
    return picked.map((q) => q.id);
  }

  #checkPools(): void {
    const { draw } = this.#deps.quizConfig;
    const questions = this.#internalQuestions;
    const pools = questions.map((q) => q.pool);
    for (const { count, size, from } of drawShortfalls(draw, pools)) {
      console.warn(
        `[tessera] useQuiz: quiz.draw asks for ${count} ${from}, but only ` +
          `${size} registered, so each attempt gets ${size}.`,
      );
    }
    for (const q of questions) {
      const problem = poolProblem(draw, q.pool);
      if (problem)
        console.warn(`[tessera] useQuiz: question "${q.id}" ${problem}`);
    }
  }

  registerQuestion(api: UseQuizQuestionApi): UseQuestionHandle {
    let id = api.id;
    if (this.#indexById.has(id)) {
      let n = 2;
      while (this.#indexById.has(`${api.id}-${n}`)) n++;
      id = `${api.id}-${n}`;
      console.warn(
        this.#rewrittenIds.has(api.id)
          ? `[tessera] useQuiz: question id "${api.id}" is already taken by an earlier question whose ` +
              `duplicate id was rewritten to it, so it is registered as "${id}" instead. ` +
              'Give the earlier duplicates unique ids, because the rewritten one is the key ' +
              "this question's LMS interaction is recorded under."
          : `[tessera] useQuiz: duplicate question id "${api.id}" is registered as "${id}" instead. ` +
              'Give each question in a quiz a unique id, because the rewritten one is the key ' +
              'its LMS interaction is recorded under.',
      );
      this.#rewrittenIds.add(id);
    }
    const internal: InternalQuestion = {
      ...api,
      id,
      weight: normalizeWeight(api.weight),
      render: undefined,
    };
    this.#internalQuestions.push(internal);
    const index = this.#internalQuestions.length - 1;
    this.#indexById.set(id, index);
    const inAttempt = this.#inAttempt(index);
    if (!this.#fromSave && !inAttempt) this.#queueDraw(id);
    const answer =
      this.#fromSave && inAttempt
        ? restoreResponse(internal, this.#deps.restore?.responses?.get(id))
        : undefined;
    if (answer !== undefined) {
      this.#answers.set(index, answer);
    } else if (this.#fromSave && inAttempt) {
      // `restored` is now true, and a review of it would judge nothing.
      this.#answerMissing = true;
      this.#reviewing = false;
    }
    const handle = this.#makeQuestionHandle(index);
    this.#questionHandles = [...this.#questionHandles, handle];
    return handle;
  }

  setAnswer(index: number, answer: unknown): void {
    // The first answer fixes which questions the attempt draws from.
    if (import.meta.env?.DEV && !this.#poolsChecked) {
      this.#poolsChecked = true;
      this.#checkPools();
    }
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
    const attempt = this.#attempt;
    if (this.#submitted || attempt.length === 0) return;
    if (!this.#allAnswered) {
      console.warn(
        '[tessera] useQuiz: submit() ran with an unanswered or half-built question, ' +
          'so nothing was scored. Gate your Submit button on handle.canSubmit.',
      );
      return;
    }

    for (const i of attempt) this.#commit(i);
    this.#savedDraw = null;
    this.#persistedDraw = null;

    const computed = this.#computeScore(attempt);
    const scored = computed !== null;
    // A quiz of only survey or reflection questions has nothing to fail.
    const score = computed ?? 100;
    if (!scored && import.meta.env?.DEV && this.#deps.quizConfig.graded) {
      console.warn(
        '[tessera] useQuiz: this quiz is graded, but no question has a `correct` answer, ' +
          'so every learner scores 100 toward the course score. ' +
          'Leave `graded` off for a survey or reflection quiz.',
      );
    }
    this.#score = score;
    this.#scored = scored;
    // Same rule as ProgressState.quizCompleted: a scored attempt beats a placeholder.
    const best =
      this.#attemptCount === 0 ||
      (scored === this.#bestScored ? score >= this.#bestScore : scored);
    if (best) {
      this.#bestScore = score;
      this.#bestScored = scored;
    }
    this.#submitted = true;
    this.#fromSave = false;
    this.#attemptCount++;

    // A review needs every answer; short of that only an incorrect-only
    // retry reads them, to lock the correct ones.
    const questions = attempt.map((i) => this.#internalQuestions[i]);
    const responses = new Map<string, unknown>();
    if (
      this.#deps.quizConfig.retryMode === 'incorrect-only' ||
      questions.every((q) => q.restore)
    ) {
      for (const q of questions) {
        if (!q.restore) continue;
        const response = q.interaction?.()?.response;
        if (response !== undefined) responses.set(q.id, response);
      }
    }
    this.#deps.onComplete(
      score,
      responses,
      scored,
      this.#attemptIds ? questions.map((q) => q.id) : undefined,
    );
    this.#deps.notify?.('tessera-quiz-complete', { score, scored });
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
    const kept = new Set<number>();
    this.#lockedCorrect.clear();
    const incorrectOnly = this.#deps.quizConfig.retryMode === 'incorrect-only';
    // A restored attempt missing a question can't be asked again as it was.
    const redraw =
      this.#attemptIds !== null && (!incorrectOnly || this.#questionMissing);
    if (incorrectOnly && !redraw) {
      for (const i of this.#attempt) {
        // A question restored without its answer can read as correct, and
        // locked it could never be answered.
        if (!this.#answers.has(i)) continue;
        const correct = this.#internalQuestions[i].checkAnswer();
        if (correct) this.#lockedCorrect.add(i);
        // An answer with no `correct` can't be wrong: it stays, still editable.
        if (correct !== false) kept.add(i);
      }
    }
    for (const i of [...this.#answers.keys()]) {
      if (!kept.has(i)) this.#answers.delete(i);
    }
    this.#reportedAnswers.clear();
    for (let i = 0; i < this.#internalQuestions.length; i++) {
      if (!kept.has(i)) this.#internalQuestions[i].reset?.();
    }
    this.#feedbackShown.clear();
    this.#submitted = false;
    this.#fromSave = false;
    this.#reviewing = false;
    this.#score = 0;
    if (redraw) this.#drawAttempt();
  }

  #commit(index: number): void {
    const q = this.#internalQuestions[index];
    if (!q || typeof q.interaction !== 'function') return;
    const interaction = q.interaction();
    if (!interaction) return;
    const fingerprint = JSON.stringify(interaction);
    if (this.#reportedAnswers.get(index) === fingerprint) return;
    this.#deps.report(q.id, interaction, q.checkAnswer(), q.text?.());
    this.#reportedAnswers.set(index, fingerprint);
  }

  /** Null when no question has a `correct` to score. */
  #computeScore(attempt: number[]): number | null {
    return scoredMean(
      attempt.map((i) => {
        const q = this.#internalQuestions[i];
        const correct = q.checkAnswer();
        return {
          score: correct ? 100 : 0,
          weight: q.weight,
          unscored: correct === null,
        };
      }),
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
      get inAttempt() {
        return engine.#inAttempt(i);
      },
      setAnswer(a: unknown) {
        engine.setAnswer(i, a);
      },
      commit() {
        // A submitted answer is already reported, in this visit or an earlier one.
        if (!engine.#submitted && engine.#inAttempt(i)) engine.#commit(i);
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
