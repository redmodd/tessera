import { isCorrect, type Interaction } from './interaction.js';
import type { UseQuestionHandle, UseQuestionOptions } from './hooks.svelte.js';
import type { QuizEngineDeps } from './quiz-engine.svelte.js';

export interface StandaloneQuestionDeps extends Pick<QuizEngineDeps, 'report'> {
  markScore: (score: number) => void;
}

export class StandaloneQuestion implements UseQuestionHandle {
  readonly mode = 'standalone';
  readonly render = undefined;

  #opts: UseQuestionOptions;
  #deps: StandaloneQuestionDeps;

  #submitted = $state(false);
  #correct = $state<boolean | null>(null);
  #retryCount = $state(0);
  #answer = $state<unknown>(undefined);
  #reported: string | null = null;

  constructor(opts: UseQuestionOptions, deps: StandaloneQuestionDeps) {
    this.#opts = opts;
    this.#deps = deps;
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
    return this.#correct === true;
  }

  get canRetry(): boolean {
    return (
      !this.isLockedCorrect &&
      this.#retryCount < (this.#opts.maxRetries ?? Infinity)
    );
  }

  get retryCount(): number {
    return this.#retryCount;
  }

  setAnswer = (answer: unknown): void => {
    this.#answer = answer;
  };

  commit = (): void => {
    const response = this.#opts.response();
    if (response) this.#report(response, isCorrect(response));
  };

  submit = (): void => {
    if (this.#submitted) return;
    const response = this.#opts.response();
    if (!response) return;
    const correct = isCorrect(response);
    this.#correct = correct;

    this.#report(response, correct);
    this.#deps.markScore(this.#opts.score?.() ?? (correct ? 100 : 0));

    this.#submitted = true;
  };

  reset = (): void => {
    if (this.#submitted) this.retry();
    else this.#clear();
  };

  retry = (): void => {
    if (!this.#submitted || !this.canRetry) return;
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
    this.#answer = undefined;
    this.#reported = null;
    this.#opts.reset?.();
  }
}
