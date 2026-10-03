import type { Interaction } from './interaction.js';
import { isCorrect as isCorrectInteraction } from './interaction.js';
import type { UseQuestionHandle, UseQuestionOptions } from './hooks.svelte.js';

/**
 * Dependencies injected into {@link StandaloneQuestion}. The `useQuestion`
 * wrapper bridges them to the LMS adapter and page progress, and passes no-ops
 * when either is absent.
 */
export interface StandaloneQuestionDeps {
  report: (
    id: string,
    interaction: Interaction,
    correct: boolean | null,
  ) => void;
  markScore: (
    id: string,
    score: number,
    graded: boolean,
    weight: number | undefined,
  ) => void;
}

/** A question outside a quiz: owns its own submit, retry and LMS reporting. */
export class StandaloneQuestion implements UseQuestionHandle {
  readonly mode = 'standalone';
  readonly render = undefined;

  #opts: UseQuestionOptions;
  #deps: StandaloneQuestionDeps;
  #maxRetries: number;

  #submitted = $state(false);
  #correct = $state<boolean | null>(null);
  #retryCount = $state(0);
  #answer = $state<unknown>(undefined);
  #committed = false;

  constructor(opts: UseQuestionOptions, deps: StandaloneQuestionDeps) {
    this.#opts = opts;
    this.#deps = deps;
    this.#maxRetries = opts.maxRetries ?? Infinity;
  }

  get id(): string {
    return this.#opts.id;
  }

  get submitted(): boolean {
    return this.#submitted;
  }

  get correct(): boolean | null {
    return this.#correct;
  }

  get answer(): unknown {
    return this.#answer;
  }

  get answerComplete(): boolean {
    return this.#answer !== undefined && (this.#opts.complete?.() ?? true);
  }

  get feedbackVisible(): boolean {
    return this.#submitted;
  }

  get locked(): boolean {
    return this.#submitted;
  }

  get isLockedCorrect(): boolean {
    return (
      this.#submitted &&
      this.#correct === true &&
      this.#retryCount >= this.#maxRetries
    );
  }

  get canRetry(): boolean {
    return this.#retryCount < this.#maxRetries;
  }

  get retryCount(): number {
    return this.#retryCount;
  }

  setAnswer(answer: unknown): void {
    this.#answer = answer;
  }

  commit(): void {
    const response = this.#opts.response();
    if (!response) return;
    this.#committed = true;
    this.#deps.report(this.#opts.id, response, isCorrectInteraction(response));
  }

  submit(): void {
    if (this.#submitted) return;
    const opts = this.#opts;
    const response = opts.response();
    this.#answer = response.response;
    const correct = isCorrectInteraction(response);
    this.#correct = correct;
    const score = opts.score ? opts.score() : correct === true ? 100 : 0;

    if (!this.#committed) {
      this.#deps.report(opts.id, response, correct);
      this.#committed = true;
    }
    this.#deps.markScore(opts.id, score, !!opts.graded, opts.weight);

    this.#submitted = true;
  }

  reset(): void {
    this.#submitted = false;
    this.#correct = null;
    this.#answer = undefined;
    this.#committed = false;
    this.#opts.reset?.();
  }

  retry(): void {
    if (this.#retryCount >= this.#maxRetries) return;
    this.#retryCount++;
    this.reset();
  }

  setRender(): void {}
}
