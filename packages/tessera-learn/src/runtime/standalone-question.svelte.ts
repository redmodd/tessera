import { isCorrect, restoreResponse, type Interaction } from './interaction.js';
import type { UseQuestionHandle, UseQuestionOptions } from './hooks.svelte.js';
import type { QuizEngineDeps } from './quiz-engine.svelte.js';
import {
  clampScore,
  retriesLeft,
  type StandaloneRestore,
  type StandaloneSubmit,
} from './progress.svelte.js';

export interface StandaloneQuestionDeps extends Pick<QuizEngineDeps, 'report'> {
  markScore: (score: number, submit: StandaloneSubmit) => void;
  /**
   * What this question last submitted, on this mount's page. The handle starts
   * submitted with it; a retry clicked but not resubmitted is not part of it.
   */
  saved?: StandaloneRestore;
}

export class StandaloneQuestion implements UseQuestionHandle {
  readonly mode = 'standalone';
  readonly render = undefined;

  #opts: UseQuestionOptions;
  #deps: StandaloneQuestionDeps;

  #submitted = $state(false);
  #correct = $state<boolean | null>(null);
  #score = $state(0);
  #retryCount = $state(0);
  #answer = $state<unknown>(undefined);
  #reported: string | null = null;

  constructor(opts: UseQuestionOptions, deps: StandaloneQuestionDeps) {
    this.#opts = opts;
    this.#deps = deps;
    const { saved } = deps;
    if (!saved) return;
    this.#submitted = true;
    this.#score = saved.score;
    this.#retryCount = saved.retries;
    this.#correct = saved.correct;
    this.#answer = restoreResponse(opts, saved.response);
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
    return this.#submitted && this.#score >= 100;
  }

  get canRetry(): boolean {
    return this.#submitted && !this.isLockedCorrect && this.#retriesLeft;
  }

  get #retriesLeft(): boolean {
    return retriesLeft(this.#retryCount, this.#opts.maxRetries);
  }

  get retryCount(): number {
    return this.#retryCount;
  }

  setAnswer = (answer: unknown): void => {
    this.#answer = answer;
  };

  commit = (): void => {
    // A submitted answer is already reported, in this visit or an earlier one.
    if (this.#submitted) return;
    const response = this.#opts.response();
    if (response) this.#report(response, isCorrect(response));
  };

  submit = (): void => {
    if (this.#submitted) return;
    const response = this.#opts.response();
    if (!response) return;
    const correct = isCorrect(response);
    const score = clampScore(this.#opts.score?.() ?? (correct ? 100 : 0));

    this.#deps.markScore(score, {
      retries: this.#retryCount,
      response: this.#opts.restore ? response.response : undefined,
      correct,
      final: !this.#retriesLeft,
    });
    this.#report(response, correct);

    this.#correct = correct;
    this.#score = score;
    this.#submitted = true;
  };

  reset = (): void => {
    if (this.#submitted) this.retry();
    else this.#clear();
  };

  retry = (): void => {
    if (!this.canRetry) return;
    this.#retryCount++;
    this.#clear();
  };

  setRender = (): void => {};

  #report(response: Interaction, correct: boolean | null): void {
    const fingerprint = JSON.stringify(response);
    if (this.#reported === fingerprint) return;
    this.#deps.report(this.#opts.id, response, correct);
    this.#reported = fingerprint;
  }

  #clear(): void {
    this.#submitted = false;
    this.#correct = null;
    this.#score = 0;
    this.#answer = undefined;
    this.#reported = null;
    this.#opts.reset?.();
  }
}
