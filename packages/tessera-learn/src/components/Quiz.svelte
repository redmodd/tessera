<script>
  import { getContext } from 'svelte';
  import { useQuiz } from '../runtime/hooks.svelte.js';
  import { TESSERA_PAGE } from '../runtime/contexts.js';

  let { children } = $props();
  let quizElement = $state(null);

  const handle = useQuiz({ element: () => quizElement });

  const pageCtx = getContext(TESSERA_PAGE);
  let quizConfig = $derived(pageCtx?.quiz ?? {});
  let feedbackDisabled = $derived(quizConfig.feedbackMode === 'never');
  let maxAttempts = $derived(quizConfig.maxAttempts ?? Infinity);
  let isImmediateMode = $derived(
    !feedbackDisabled && quizConfig.feedbackMode === 'immediate',
  );

  let currentQuestionIndex = $state(0);
  let reviewIndex = $state(0);

  let totalQuestions = $derived(handle.questions.length);
  let currentQuestion = $derived(handle.questions[currentQuestionIndex]);
  let correctCount = $derived(
    handle.questions.reduce((sum, q) => sum + (q.correct ? 1 : 0), 0),
  );
  let passed = $derived(handle.score >= handle.passingScore);

  function isAnswered(q) {
    if (!q) return false;
    return q.answer !== undefined || q.isLockedCorrect;
  }

  function needsReveal(q) {
    if (!q) return false;
    return (
      isImmediateMode &&
      isAnswered(q) &&
      !q.isLockedCorrect &&
      !q.feedbackVisible
    );
  }

  function goNextQuestion() {
    // Immediate-mode: first click reveals feedback, second advances.
    if (needsReveal(currentQuestion)) {
      revealCurrent();
      return;
    }
    if (currentQuestionIndex < totalQuestions - 1) {
      currentQuestionIndex++;
    }
  }

  function revealCurrent() {
    currentQuestion.commit();
    handle.revealFeedback(currentQuestion);
  }

  function goPrevQuestion() {
    if (currentQuestionIndex > 0) currentQuestionIndex--;
  }

  function goNextReview() {
    if (reviewIndex < totalQuestions - 1) reviewIndex++;
  }

  function goPrevReview() {
    if (reviewIndex > 0) reviewIndex--;
  }

  function handleSubmit() {
    if (!handle.canSubmit) return;
    handle.submit();
  }

  function handleStartReview() {
    reviewIndex = 0;
    handle.startReview();
  }

  function handleRetry() {
    handle.retry();
    currentQuestionIndex = 0;
    reviewIndex = 0;
  }
</script>

{#snippet questionList(activeIndex)}
  <div class="tessera-quiz-questions">
    {#each handle.questions as q, i (q.id)}
      <div
        class="tessera-quiz-question-wrapper"
        class:active={i === activeIndex}
        aria-hidden={i !== activeIndex}
      >
        {#if q.render}
          {@render q.render()}
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div
  class="tessera-quiz"
  bind:this={quizElement}
  role="region"
  aria-label="Quiz"
>
  {#if handle.state === 'answering'}
    <!-- Question phase -->
    <div class="tessera-quiz-progress" aria-live="polite">
      <span class="tessera-quiz-progress-text">
        <span class="tessera-quiz-progress-desktop"
          >Question {currentQuestionIndex + 1} of {totalQuestions}</span
        >
        <span class="tessera-quiz-progress-mobile"
          >{currentQuestionIndex + 1}/{totalQuestions}</span
        >
      </span>
      <div class="tessera-progress-track">
        <div
          class="tessera-progress-fill"
          style="width: {totalQuestions > 0
            ? ((currentQuestionIndex + 1) / totalQuestions) * 100
            : 0}%"
        ></div>
      </div>
    </div>

    {@render questionList(currentQuestionIndex)}

    <div class="tessera-quiz-nav">
      <button
        class="tessera-quiz-btn tessera-quiz-btn-secondary"
        disabled={currentQuestionIndex === 0}
        onclick={goPrevQuestion}
      >
        Back
      </button>
      {#if currentQuestionIndex < totalQuestions - 1}
        <button
          class="tessera-quiz-btn tessera-btn-primary"
          disabled={!isAnswered(currentQuestion)}
          onclick={goNextQuestion}
        >
          {#if !isImmediateMode}
            Next
          {:else if currentQuestion?.feedbackVisible}
            Next Question
          {:else}
            Submit
          {/if}
        </button>
      {:else if needsReveal(currentQuestion)}
        <button
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={revealCurrent}
        >
          Submit
        </button>
      {:else}
        <button
          class="tessera-quiz-btn tessera-btn-primary tessera-quiz-btn-submit"
          disabled={!handle.canSubmit}
          onclick={handleSubmit}
        >
          {isImmediateMode ? 'See Results' : 'Submit'}
        </button>
      {/if}
    </div>
  {:else if handle.state === 'reviewing'}
    <!-- Review phase -->
    <div class="tessera-quiz-progress" aria-live="polite">
      <span class="tessera-quiz-progress-text">
        <span class="tessera-quiz-progress-desktop"
          >Review: Question {reviewIndex + 1} of {totalQuestions}</span
        >
        <span class="tessera-quiz-progress-mobile"
          >Review: {reviewIndex + 1}/{totalQuestions}</span
        >
      </span>
    </div>

    {@render questionList(reviewIndex)}

    <div class="tessera-quiz-nav">
      <button
        class="tessera-quiz-btn tessera-quiz-btn-secondary"
        disabled={reviewIndex === 0}
        onclick={goPrevReview}
      >
        Back
      </button>
      {#if reviewIndex < totalQuestions - 1}
        <button
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={goNextReview}
        >
          Next
        </button>
      {:else}
        <button
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={() => handle.exitReview()}
        >
          Done
        </button>
      {/if}
    </div>
  {:else}
    <!-- Results phase -->
    <div class="tessera-quiz-results" role="status" aria-live="polite">
      <h2 class="tessera-quiz-results-title">Quiz Results</h2>
      <div class="tessera-quiz-score">
        <span class="tessera-quiz-score-value">{handle.score}%</span>
        <span
          class="tessera-quiz-score-label"
          class:passed
          class:failed={!passed}
        >
          {passed ? 'Passed' : 'Not Passed'}
        </span>
      </div>
      <p class="tessera-quiz-results-detail">
        You answered {correctCount} of {totalQuestions} questions correctly.
      </p>

      <div class="tessera-quiz-results-actions">
        {#if !feedbackDisabled}
          <button
            class="tessera-quiz-btn tessera-quiz-btn-secondary"
            onclick={handleStartReview}
          >
            Review Answers
          </button>
        {/if}
        {#if handle.canRetry}
          <button
            class="tessera-quiz-btn tessera-btn-primary"
            onclick={handleRetry}
          >
            Retry Quiz
          </button>
        {/if}
        {#if maxAttempts !== Infinity && handle.attemptCount >= maxAttempts}
          <p class="tessera-quiz-attempts-exhausted">
            All attempts used ({handle.attemptCount}/{maxAttempts})
          </p>
        {/if}
      </div>
    </div>
  {/if}
  <!-- Children always mounted so snippets survive submit/review phases -->
  <div style="display:none">
    {@render children?.()}
  </div>
</div>

<style>
  .tessera-quiz {
    margin: var(--tessera-spacing-xl) 0;
  }

  .tessera-quiz-progress {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-md);
    margin-bottom: var(--tessera-spacing-lg);
    font-size: 0.875rem;
    color: var(--tessera-text-light);
  }

  .tessera-quiz-progress-text {
    white-space: nowrap;
  }

  .tessera-quiz-progress-mobile {
    display: none;
  }

  .tessera-quiz-progress :global(.tessera-progress-track) {
    flex: 1;
  }

  .tessera-quiz-question-wrapper {
    display: none;
  }

  .tessera-quiz-question-wrapper.active {
    display: block;
  }

  .tessera-quiz-nav {
    display: flex;
    justify-content: space-between;
    gap: var(--tessera-spacing-md);
    margin-top: var(--tessera-spacing-lg);
    padding-top: var(--tessera-spacing-lg);
    border-top: 1px solid var(--tessera-border);
  }

  .tessera-quiz-btn {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.2s,
      opacity 0.2s;
    min-height: 44px;
    min-width: 44px;
  }

  .tessera-quiz-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tessera-quiz-btn-secondary {
    background: var(--tessera-bg-secondary);
    color: var(--tessera-text);
    border: 1px solid var(--tessera-border);
  }

  .tessera-quiz-btn-secondary:hover:not(:disabled) {
    background: var(--tessera-border);
  }

  .tessera-quiz-results {
    text-align: center;
    padding: var(--tessera-spacing-xl);
  }

  .tessera-quiz-results-title {
    font-size: 1.5rem;
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-quiz-score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-quiz-score-value {
    font-size: 3rem;
    font-weight: 700;
    color: var(--tessera-text);
  }

  .tessera-quiz-score-label {
    font-size: 1.125rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
  }

  .tessera-quiz-score-label.passed {
    color: color-mix(in srgb, var(--tessera-success) 55%, black);
    background: color-mix(in srgb, var(--tessera-success) 12%, white);
  }

  .tessera-quiz-score-label.failed {
    color: color-mix(in srgb, var(--tessera-error) 55%, black);
    background: color-mix(in srgb, var(--tessera-error) 12%, white);
  }

  .tessera-quiz-results-detail {
    color: var(--tessera-text-light);
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-quiz-results-actions {
    display: flex;
    gap: var(--tessera-spacing-md);
    justify-content: center;
    flex-wrap: wrap;
  }

  .tessera-quiz-attempts-exhausted {
    color: var(--tessera-text-light);
    font-size: 0.875rem;
    font-style: italic;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .tessera-quiz-progress-desktop {
      display: none;
    }
    .tessera-quiz-progress-mobile {
      display: inline;
    }

    .tessera-quiz-nav {
      position: sticky;
      bottom: 0;
      background: var(--tessera-bg);
      padding: var(--tessera-spacing-md);
      margin: 0 calc(-1 * var(--tessera-spacing-md));
      border-top: 1px solid var(--tessera-border);
    }

    .tessera-quiz-btn {
      flex: 1;
    }
  }
</style>
