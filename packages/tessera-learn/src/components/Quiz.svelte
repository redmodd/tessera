<script>
  import { tick } from 'svelte';
  import { useQuiz } from '../runtime/hooks.svelte.js';

  let { children } = $props();
  const handle = useQuiz();

  const feedbackDisabled = handle.feedbackMode === 'never';
  const isImmediateMode = handle.feedbackMode === 'immediate';

  let currentQuestionIndex = $state(0);
  let reviewIndex = $state(0);
  let progressEl = $state();
  let resultsEl = $state();
  const resultsId = $props.id();

  // The button the learner pressed is disabled or gone once the question or
  // phase changes, so focus moves to what replaced it. Arrow keys stay in the
  // quiz from there, even on what a page change focused first.
  async function focusProgress() {
    await tick();
    progressEl?.removeAttribute('data-tessera-page-focus');
    progressEl?.focus();
  }

  async function focusResults() {
    await tick();
    resultsEl?.removeAttribute('data-tessera-page-focus');
    resultsEl?.focus();
  }

  let totalQuestions = $derived(handle.questions.length);
  let currentQuestion = $derived(handle.questions[currentQuestionIndex]);
  let results = $derived(handle.questions.map((q) => q.correct));
  let correctCount = $derived(results.filter((c) => c).length);
  let scoredCount = $derived(results.filter((c) => c !== null).length);
  // A result restored without its answers reads every question as null.
  let unscored = $derived(!handle.restored && scoredCount === 0);
  let attemptPassed = $derived(handle.score >= handle.passingScore);
  let passed = $derived(handle.bestScore >= handle.passingScore);
  let bestBeaten = $derived(handle.bestScore > handle.score);

  function isAnswered(q) {
    if (!q) return false;
    return q.answerComplete || q.isLockedCorrect;
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
      focusProgress();
    }
  }

  function revealCurrent() {
    currentQuestion.commit();
    handle.revealFeedback(currentQuestion);
  }

  function goPrevQuestion() {
    if (currentQuestionIndex === 0) return;
    currentQuestionIndex--;
    focusProgress();
  }

  function goNextReview() {
    if (reviewIndex === totalQuestions - 1) return;
    reviewIndex++;
    focusProgress();
  }

  function goPrevReview() {
    if (reviewIndex === 0) return;
    reviewIndex--;
    focusProgress();
  }

  function handleSubmit() {
    if (!handle.canSubmit) return;
    handle.submit();
    focusResults();
  }

  function handleStartReview() {
    reviewIndex = 0;
    handle.startReview();
    focusProgress();
  }

  function handleExitReview() {
    handle.exitReview();
    focusResults();
  }

  function handleRetry() {
    handle.retry();
    currentQuestionIndex = 0;
    reviewIndex = 0;
    focusProgress();
  }
</script>

{#snippet progressHeading(prefix, index)}
  <h2 class="tessera-quiz-progress-text" tabindex="-1" bind:this={progressEl}>
    <span class="tessera-quiz-progress-desktop"
      >{prefix}Question {index + 1} of {totalQuestions}</span
    >
    <span class="tessera-quiz-progress-mobile" aria-hidden="true"
      >{prefix}{index + 1}/{totalQuestions}</span
    >
  </h2>
{/snippet}

{#snippet backButton(disabled, onclick)}
  <button
    type="button"
    class="tessera-quiz-btn tessera-quiz-btn-secondary"
    {disabled}
    {onclick}
  >
    Back
  </button>
{/snippet}

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

<div class="tessera-quiz" role="region" aria-label="Quiz">
  <div class="tessera-quiz-intro" hidden={handle.state !== 'answering'}>
    {@render children?.()}
  </div>

  {#if handle.state === 'answering'}
    <!-- Question phase -->
    <div class="tessera-quiz-progress">
      {@render progressHeading('', currentQuestionIndex)}
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

    <!-- The forward button comes first in the Tab order; CSS keeps Back on the left. -->
    <div class="tessera-quiz-nav">
      {#if currentQuestionIndex < totalQuestions - 1}
        <button
          type="button"
          class="tessera-quiz-btn tessera-btn-primary"
          disabled={!isAnswered(currentQuestion)}
          onclick={goNextQuestion}
        >
          {#if needsReveal(currentQuestion)}
            Submit
          {:else if isImmediateMode && currentQuestion?.feedbackVisible}
            Next Question
          {:else}
            Next
          {/if}
        </button>
      {:else if needsReveal(currentQuestion)}
        <button
          type="button"
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={revealCurrent}
        >
          Submit
        </button>
      {:else}
        <button
          type="button"
          class="tessera-quiz-btn tessera-btn-primary tessera-quiz-btn-submit"
          disabled={!handle.canSubmit}
          onclick={handleSubmit}
        >
          {isImmediateMode && isAnswered(currentQuestion)
            ? 'See Results'
            : 'Submit'}
        </button>
      {/if}
      {@render backButton(currentQuestionIndex === 0, goPrevQuestion)}
    </div>
  {:else if handle.state === 'reviewing'}
    <!-- Review phase -->
    <div class="tessera-quiz-progress">
      {@render progressHeading('Review: ', reviewIndex)}
    </div>

    {@render questionList(reviewIndex)}

    <div class="tessera-quiz-nav">
      {#if reviewIndex < totalQuestions - 1}
        <button
          type="button"
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={goNextReview}
        >
          Next
        </button>
      {:else}
        <button
          type="button"
          class="tessera-quiz-btn tessera-btn-primary"
          onclick={handleExitReview}
        >
          Done
        </button>
      {/if}
      {@render backButton(reviewIndex === 0, goPrevReview)}
    </div>
  {:else}
    <!-- Results phase -->
    <div class="tessera-quiz-results">
      <!-- Named by its text so focus reads the score, not just the heading. -->
      <div
        role="group"
        aria-labelledby={resultsId}
        tabindex="-1"
        bind:this={resultsEl}
      >
        <div id={resultsId}>
          <h2 class="tessera-quiz-results-title">Quiz Results</h2>
          {#if unscored}
            <p class="tessera-quiz-results-detail">
              Your answers have been submitted.
            </p>
          {:else if bestBeaten}
            <div
              class="tessera-quiz-score paired"
              data-testid="quiz-attempt-score"
            >
              <span class="tessera-quiz-score-caption">This attempt</span>
              <span class="tessera-quiz-score-value">{handle.score}%</span>
              <span
                class="tessera-quiz-score-label"
                class:passed={attemptPassed}
                class:failed={!attemptPassed}
              >
                {attemptPassed ? 'Passed' : 'Not Passed'}
              </span>
            </div>
            <div
              class="tessera-quiz-score paired"
              data-testid="quiz-best-score"
            >
              <span class="tessera-quiz-score-caption">On record</span>
              <span class="tessera-quiz-score-value">{handle.bestScore}%</span>
              <span
                class="tessera-quiz-score-label"
                class:passed
                class:failed={!passed}
              >
                {passed ? 'Passed' : 'Not Passed'}
              </span>
            </div>
          {:else}
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
          {/if}
          {#if handle.restored}
            <p class="tessera-quiz-results-detail">Your previous result.</p>
          {:else if !unscored}
            <p class="tessera-quiz-results-detail">
              You answered {correctCount} of {scoredCount} questions correctly.
            </p>
          {/if}
        </div>
      </div>
      <div class="tessera-quiz-results-actions">
        {#if !feedbackDisabled && !handle.restored}
          <button
            type="button"
            class="tessera-quiz-btn tessera-quiz-btn-secondary"
            onclick={handleStartReview}
          >
            Review Answers
          </button>
        {/if}
        {#if handle.canRetry}
          <button
            type="button"
            class="tessera-quiz-btn tessera-btn-primary"
            onclick={handleRetry}
          >
            Retry Quiz
          </button>
        {/if}
        {#if handle.attemptCount >= handle.maxAttempts}
          <p class="tessera-quiz-attempts-exhausted">
            All attempts used ({handle.attemptCount}/{handle.maxAttempts})
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  @layer tessera {
    .tessera-quiz {
      margin: var(--tessera-spacing-xl) 0;
    }

    .tessera-quiz-intro:not(:empty) {
      margin-bottom: var(--tessera-spacing-lg);
    }

    .tessera-quiz-intro[hidden] {
      display: none;
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
      margin: 0;
      font: inherit;
      color: inherit;
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
      flex-direction: row-reverse;
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

    .tessera-quiz-score.paired {
      gap: 0.25rem;
      margin-bottom: var(--tessera-spacing-md);
    }

    .tessera-quiz-score.paired .tessera-quiz-score-value {
      font-size: 2rem;
    }

    .tessera-quiz-score-caption {
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--tessera-text-light);
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
      /* Screen readers keep the full text; "2/3" can be read as a fraction. */
      .tessera-quiz-progress-desktop {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
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
  }
</style>
