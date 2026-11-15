import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { normalizeWeight, scoredMean } from './progress.svelte.js';
import { restoreResponse, type Interaction } from './interaction.js';
import type { QuizConfig } from './types.js';
import type { QuizPageState } from './contexts.js';
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
  ) => void;
  /** Author-facing DOM notification; a no-op unless the shell supplies an element. */
  notify?: (name: string, detail?: unknown) => void;
  /**
   * Saved attempt count, best score and that attempt's responses for this
   * quiz page. With attempts > 0 the engine starts in the results phase, and
   * can review them once every question has taken its answer back: see
   * {@link QuizEngine.restored}.
   */
  restore?: QuizPageState;
}

type InternalQuestion = UseQuizQuestionApi & {
  /** The id the widget asked for; `id` is the unique one it is recorded under. */
  requestedId: string;
  /** Set once the id is reported, saved or restored; until then it can still change. */
  fixed?: boolean;
  weight: number;
  handle: UseQuestionHandle;
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

  // A widget's onDestroy sees any state written in the same flush at its old
  // value, so what unregisterQuestion() reads is kept in plain fields too.
  #members: InternalQuestion[] = [];
  #questionHandles = $state.raw<UseQuestionHandle[]>([]);
  #submittedState = $state(false);
  #submittedNow = false;
  #answers = new SvelteMap<InternalQuestion, unknown>();
  #renders = new SvelteMap<InternalQuestion, unknown>();
  #reportedAnswers = new Map<InternalQuestion, string>();
  // Unmounted after submit: kept, with their results, until retry(). After an
  // incorrect-only retry, the kept answers wait here for their widgets.
  #detached = new Set<InternalQuestion>();
  // Mounted beside a question with the same id, as a keyed remount does: each
  // takes over that question's slot when it unmounts, and after submit its
  // result too.
  #latecomers = new Set<InternalQuestion>();
  #reviewing = $state(false);
  #score = $state(0);
  #bestScore = $state(0);
  #scored = $state(true);
  #bestScored = true;
  #attemptCount = $state(0);
  #fromSave = $state(false);
  // Mounted after submit without its answer, which a later setAnswer() does
  // not make reviewable.
  #unrestored = new SvelteSet<InternalQuestion>();
  // Plain fields, not $state: only the wrapper's onDestroy reads them, after
  // the questions have unmounted and taken their answers with them.
  #submitCalled = false;
  #answered = false;
  #feedbackShown = new SvelteSet<InternalQuestion>();
  #lockedCorrect = new SvelteSet<InternalQuestion>();
  // Each handle carries its question under this symbol, so a proxied copy resolves too.
  #questionKey = Symbol('tessera.question');

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
  }

  get #internalQuestions(): InternalQuestion[] {
    void this.#questionHandles; // tracks membership for reactive readers
    return this.#members;
  }

  get #submitted(): boolean {
    return this.#submittedState;
  }

  set #submitted(value: boolean) {
    this.#submittedState = value;
    this.#submittedNow = value;
  }

  // Derived values are plain getters over $state, not $derived. Getters
  // recompute on read with or without a tracking effect, so
  // engine-construction tests need no $effect.root.
  get #totalQuestions(): number {
    return this.#internalQuestions.length;
  }

  #answerComplete(q: InternalQuestion): boolean {
    return this.#answers.has(q) && (q.complete?.() ?? true);
  }

  get #allAnswered(): boolean {
    return (
      this.#totalQuestions > 0 &&
      this.#internalQuestions.every((q) => this.#answerComplete(q))
    );
  }

  get #inReview(): boolean {
    return this.#reviewing && !this.restored;
  }

  get state(): 'answering' | 'submitted' | 'reviewing' {
    return this.#inReview
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
    return (
      this.#submitted &&
      (this.#totalQuestions === 0 || this.#unrestored.size > 0)
    );
  }

  get feedbackMode(): NonNullable<QuizConfig['feedbackMode']> {
    return this.#deps.quizConfig.feedbackMode ?? 'review';
  }

  get maxAttempts(): number {
    return this.#maxAttempts;
  }

  /** Dev-warning inputs the wrapper reads in onDestroy. */
  get stats(): { answered: boolean; submitCalled: boolean } {
    return { answered: this.#answered, submitCalled: this.#submitCalled };
  }

  registerQuestion(api: UseQuizQuestionApi): UseQuestionHandle {
    const q = {
      ...api,
      requestedId: api.id,
      weight: normalizeWeight(api.weight),
    } as InternalQuestion;
    q.handle = this.#makeQuestionHandle(q);
    const prev = this.#named(this.#detached, api.id);
    if (prev) {
      this.#takeOver(prev, q);
      return q.handle;
    }
    const twin = this.#named(this.#members, api.id);
    this.#members.push(q);
    this.#publish();
    const saved = this.#fromSave
      ? this.#deps.restore?.responses?.get(q.id)
      : undefined;
    if (twin && saved === undefined) this.#latecomers.add(q);
    else if (this.#fromSave) this.#fix(q);
    if (this.#fromSave && !this.#restore(q, saved)) this.#unrestored.add(q);
    return q.handle;
  }

  /**
   * A question whose widget unmounted. While answering it leaves the quiz with
   * its answer; after submit it keeps its result until `retry()`.
   */
  unregisterQuestion(handle: Question): void {
    const q = this.#questionOf(handle);
    if (!q || !this.#members.includes(q)) return;
    const latecomer = this.#latecomers.delete(q);
    const next = this.#named(this.#latecomers, q.requestedId);
    // A latecomer has no result of its own to keep.
    if (this.#submittedNow && !latecomer) {
      if (next) this.#takeOver(q, next);
      else this.#detached.add(q);
      return;
    }
    if (next) this.#latecomers.delete(next);
    this.#replace(q, next);
    this.#publish();
    this.#forget(q);
  }

  /** Takes `prev` out of the quiz, with `next` moving into its slot. */
  #replace(prev: InternalQuestion, next?: InternalQuestion): void {
    const members = this.#members.filter((m) => m !== next);
    const at = members.indexOf(prev);
    const slot = next ? [next] : [];
    if (at >= 0) members.splice(at, 1, ...slot);
    else members.push(...slot);
    this.#members = members;
  }

  #named(
    questions: Iterable<InternalQuestion>,
    id: string,
  ): InternalQuestion | undefined {
    for (const q of questions) if (q.requestedId === id) return q;
  }

  /**
   * A widget that mounts again with a question's id takes over its place, id
   * and answer, so a remount keeps one entry per question.
   */
  #takeOver(prev: InternalQuestion, next: InternalQuestion): void {
    this.#replace(prev, next);
    next.id = prev.id;
    next.fixed = prev.fixed;
    const response = this.#answers.has(prev)
      ? prev.interaction?.()?.response
      : undefined;
    const shown = this.#feedbackShown.has(prev);
    const locked = this.#lockedCorrect.has(prev);
    this.#detached.delete(prev);
    this.#latecomers.delete(next);
    this.#forget(prev);
    this.#publish();
    if (shown) this.#feedbackShown.add(next);
    if (this.#restore(next, response)) {
      this.#unrestored.delete(next);
      if (locked) this.#lockedCorrect.add(next);
    } else if (this.#submittedNow) {
      this.#unrestored.add(next);
    }
  }

  #restore(q: InternalQuestion, response: unknown): boolean {
    const answer = restoreResponse(q, response);
    if (answer === undefined) return false;
    this.#answers.set(q, answer);
    return true;
  }

  #forget(q: InternalQuestion): void {
    this.#answers.delete(q);
    this.#renders.delete(q);
    this.#reportedAnswers.delete(q);
    this.#feedbackShown.delete(q);
    this.#lockedCorrect.delete(q);
    this.#unrestored.delete(q);
  }

  /**
   * Gives each question a unique id. A fixed id never changes; any other
   * question takes the first free one from the id it asked for, so a keyed
   * remount's question gets its plain id once its predecessor leaves.
   */
  #publish(): void {
    const taken = new Set(
      this.#members.filter((q) => q.fixed).map((q) => q.id),
    );
    for (const q of this.#members) {
      if (q.fixed) continue;
      let id = q.requestedId;
      for (let n = 2; taken.has(id); n++) id = `${q.requestedId}-${n}`;
      taken.add(id);
      q.id = id;
    }
    this.#questionHandles = this.#members.map((q) => q.handle);
  }

  #fix(q: InternalQuestion): void {
    if (q.fixed) return;
    q.fixed = true;
    if (q.id === q.requestedId) return;
    const holder = this.#members.find((m) => m.id === q.requestedId);
    console.warn(
      holder && holder.requestedId !== q.requestedId
        ? `[tessera] useQuiz: question id "${q.requestedId}" is already taken by an earlier question whose ` +
            `duplicate id was rewritten to it, so it is recorded as "${q.id}" instead. ` +
            'Give the earlier duplicates unique ids, because the rewritten one is the key ' +
            "this question's LMS interaction is recorded under."
        : `[tessera] useQuiz: duplicate question id "${q.requestedId}" is recorded as "${q.id}" instead. ` +
            'Give each question in a quiz a unique id, because the rewritten one is the key ' +
            'its LMS interaction is recorded under.',
    );
  }

  #questionOf(handle: Question): InternalQuestion | undefined {
    return (handle as unknown as Record<symbol, InternalQuestion | undefined>)[
      this.#questionKey
    ];
  }

  #feedbackVisible(q: InternalQuestion): boolean {
    const mode = this.feedbackMode;
    if (mode === 'never') return false;
    if (this.#inReview) return true;
    return mode === 'immediate' && this.#feedbackShown.has(q);
  }

  revealFeedback(handle: Question): void {
    const q = this.#questionOf(handle);
    if (q && this.feedbackMode !== 'never') this.#feedbackShown.add(q);
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

    for (const q of this.#detached) this.#forget(q);
    this.#detached.clear();
    this.#latecomers.clear();
    for (const q of this.#internalQuestions) {
      this.#fix(q);
      this.#commit(q);
    }

    const computed = this.#computeScore();
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
    this.#unrestored.clear();
    this.#attemptCount++;

    // A review needs every answer; short of that only an incorrect-only
    // retry reads them, to lock the correct ones.
    const responses = new Map<string, unknown>();
    if (
      this.#deps.quizConfig.retryMode === 'incorrect-only' ||
      this.#internalQuestions.every((q) => q.restore)
    ) {
      for (const q of this.#internalQuestions) {
        if (!q.restore) continue;
        const response = q.interaction?.()?.response;
        if (response !== undefined) responses.set(q.id, response);
      }
    }
    this.#deps.onComplete(score, responses, scored);
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
    const kept = new Set<InternalQuestion>();
    this.#lockedCorrect.clear();
    if (this.#deps.quizConfig.retryMode === 'incorrect-only') {
      for (const q of this.#internalQuestions) {
        // A question restored without its answer can read as correct, and
        // locked it could never be answered.
        if (!this.#answers.has(q)) continue;
        const correct = q.checkAnswer();
        if (correct) this.#lockedCorrect.add(q);
        // An answer with no `correct` can't be wrong: it stays, still editable.
        if (correct !== false) kept.add(q);
      }
    }
    for (const q of [...this.#answers.keys()]) {
      if (!kept.has(q)) this.#answers.delete(q);
    }
    this.#reportedAnswers.clear();
    this.#feedbackShown.clear();
    const unmounted = this.#detached;
    this.#detached = new Set([...unmounted].filter((q) => kept.has(q)));
    this.#members = this.#members.filter((q) => !unmounted.has(q));
    this.#publish();
    for (const q of unmounted) if (!kept.has(q)) this.#forget(q);
    this.#latecomers.clear();
    this.#unrestored.clear();
    for (const q of this.#internalQuestions) {
      if (!kept.has(q)) q.reset?.();
    }
    this.#submitted = false;
    this.#fromSave = false;
    this.#reviewing = false;
    this.#score = 0;
  }

  #commit(q: InternalQuestion): void {
    if (typeof q.interaction !== 'function') return;
    const interaction = q.interaction();
    if (!interaction) return;
    const fingerprint = JSON.stringify(interaction);
    if (this.#reportedAnswers.get(q) === fingerprint) return;
    this.#fix(q);
    this.#deps.report(q.id, interaction, q.checkAnswer(), q.text?.());
    this.#reportedAnswers.set(q, fingerprint);
  }

  /** Null when no question has a `correct` to score. */
  #computeScore(): number | null {
    return scoredMean(
      this.#internalQuestions.map((q) => {
        const correct = q.checkAnswer();
        return {
          score: correct ? 100 : 0,
          weight: q.weight,
          unscored: correct === null,
        };
      }),
    );
  }

  #makeQuestionHandle(q: InternalQuestion): UseQuestionHandle {
    const engine = this;
    return {
      [engine.#questionKey]: q,
      get id() {
        void engine.#questionHandles; // #publish() can rewrite an unfixed id
        return q.id;
      },
      get submitted() {
        return engine.#submitted;
      },
      get correct() {
        if (engine.restored) return null;
        if (!engine.#submitted && !engine.#feedbackVisible(q)) return null;
        return q.checkAnswer();
      },
      get answer() {
        return engine.#answers.get(q);
      },
      get answerComplete() {
        return engine.#answerComplete(q);
      },
      get feedbackVisible() {
        return engine.#feedbackVisible(q);
      },
      get locked() {
        return (
          engine.#submitted ||
          engine.#feedbackVisible(q) ||
          engine.#lockedCorrect.has(q)
        );
      },
      get isLockedCorrect() {
        return engine.#lockedCorrect.has(q);
      },
      get render() {
        return engine.#renders.get(q);
      },
      setAnswer(a: unknown) {
        engine.#answered = true;
        engine.#answers.set(q, a);
      },
      commit() {
        // A submitted answer is already reported, in this visit or an earlier one.
        if (!engine.#submitted) engine.#commit(q);
      },
      setRender(r: unknown) {
        engine.#renders.set(q, r);
      },
      submit() {},
      retry() {},
      reset() {
        q.reset?.();
      },
      canRetry: false,
      retryCount: 0,
      mode: 'quiz',
    };
  }
}
