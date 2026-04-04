<script>
  import { getContext, setContext, onMount } from 'svelte';

  // Read quiz config from page context (set by App.svelte)
  const pageCtx = getContext('tessera-page');
  const quizConfig = $derived(pageCtx?.quiz ?? {});

  // State
  let questions = $state([]);
  let currentQuestionIndex = $state(0);
  let answers = $state(new Map());
  let submitted = $state(false);
  let score = $state(0);
  let attemptCount = $state(0);
  let reviewing = $state(false);
  let reviewIndex = $state(0);

  // Immediate feedback state
  let feedbackShown = $state(new Set());
  // Retry mode: locked correct questions from prior attempt
  let lockedCorrect = $state(new Set());

  // Derived
  let totalQuestions = $derived(questions.length);
  let maxAttempts = $derived(quizConfig.maxAttempts ?? Infinity);
  let showFeedback = $derived(quizConfig.showFeedback ?? true);
  let passingScore = $derived(pageCtx?.passingScore ?? 70);
  let canRetry = $derived(attemptCount < maxAttempts);
  let passed = $derived(score >= passingScore);
  let allAnswered = $derived(totalQuestions > 0 && answers.size >= totalQuestions);
  let feedbackMode = $derived(
    (quizConfig.showFeedback && quizConfig.feedbackMode === 'immediate') ? 'immediate' : 'review'
  );
  let retryMode = $derived(quizConfig.retryMode ?? 'full');

  // Register question API (children call this on mount)
  let questionId = 0;
  function registerQuestion(questionApi) {
    const id = questionId++;
    questions = [...questions, { id, ...questionApi }];
    return id;
  }

  function setAnswer(questionIndex, answer) {
    answers = new Map([...answers, [questionIndex, answer]]);
  }

  function getAnswer(questionIndex) {
    return answers.get(questionIndex);
  }

  // Provide context to child question components
  setContext('tessera-quiz', {
    get registerQuestion() { return registerQuestion; },
    get setAnswer() { return setAnswer; },
    get getAnswer() { return getAnswer; },
    get submitted() { return submitted; },
    get reviewing() { return reviewing; },
    get showFeedback() { return showFeedback; },
    get currentQuestionIndex() { return reviewing ? reviewIndex : currentQuestionIndex; },
    get feedbackVisible() {
      return (index) => {
        if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
        if (submitted && reviewing && showFeedback) return true;
        return false;
      };
    },
    get isAnswerLocked() {
      return (index) => {
        // Locked during immediate feedback (answer already revealed)
        if (feedbackMode === 'immediate' && feedbackShown.has(index)) return true;
        // Locked after submission
        if (submitted) return true;
        // Locked from incorrect-only retry
        if (lockedCorrect.has(index)) return true;
        return false;
      };
    },
    get isLockedCorrect() {
      return (index) => lockedCorrect.has(index);
    },
  });

  // Navigation
  function goNextQuestion() {
    // Immediate feedback: first Next shows feedback, second advances
    if (feedbackMode === 'immediate'
        && answers.has(currentQuestionIndex)
        && !feedbackShown.has(currentQuestionIndex)
        && !lockedCorrect.has(currentQuestionIndex)) {
      feedbackShown = new Set([...feedbackShown, currentQuestionIndex]);
      return;
    }
    if (currentQuestionIndex < totalQuestions - 1) {
      currentQuestionIndex++;
    }
  }

  function goPrevQuestion() {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
    }
  }

  function goNextReview() {
    if (reviewIndex < totalQuestions - 1) {
      reviewIndex++;
    }
  }

  function goPrevReview() {
    if (reviewIndex > 0) {
      reviewIndex--;
    }
  }

  // Submission
  function handleSubmit() {
    if (!allAnswered) return;

    let correctCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answer = answers.get(i);
      if (q.checkAnswer(answer)) {
        correctCount++;
      }
    }

    score = Math.round((correctCount / totalQuestions) * 100);
    submitted = true;
    attemptCount++;

    // Report score to progress via custom event
    const event = new CustomEvent('tessera-quiz-complete', {
      detail: { score },
      bubbles: true,
    });
    quizElement?.dispatchEvent(event);
  }

  // Review
  function startReview() {
    reviewing = true;
    reviewIndex = 0;
  }

  function exitReview() {
    reviewing = false;
  }

  // Retry
  function handleRetry() {
    submitted = false;
    reviewing = false;
    score = 0;
    currentQuestionIndex = 0;
    reviewIndex = 0;
    feedbackShown = new Set();

    if (retryMode === 'incorrect-only') {
      // Identify correct questions
      const newLockedCorrect = new Set();
      const preservedAnswers = new Map();
      for (let i = 0; i < questions.length; i++) {
        const answer = answers.get(i);
        if (questions[i].checkAnswer(answer)) {
          newLockedCorrect.add(i);
          preservedAnswers.set(i, answer);
        }
      }
      lockedCorrect = newLockedCorrect;
      answers = preservedAnswers;
      // Only reset incorrect questions
      for (let i = 0; i < questions.length; i++) {
        if (!newLockedCorrect.has(i) && questions[i].reset) {
          questions[i].reset();
        }
      }
    } else {
      lockedCorrect = new Set();
      answers = new Map();
      for (const q of questions) {
        if (q.reset) q.reset();
      }
    }
  }

  let { children } = $props();
  let quizElement = $state(null);
</script>

<div class="tessera-quiz" bind:this={quizElement} role="region" aria-label="Quiz">
  {#if !submitted}
    <!-- Question phase -->
    <div class="tessera-quiz-progress" aria-live="polite">
      <span class="tessera-quiz-progress-text">
        <span class="tessera-quiz-progress-desktop">Question {currentQuestionIndex + 1} of {totalQuestions}</span>
        <span class="tessera-quiz-progress-mobile">{currentQuestionIndex + 1}/{totalQuestions}</span>
      </span>
      <div class="tessera-quiz-progress-bar">
        <div
          class="tessera-quiz-progress-fill"
          style="width: {totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0}%"
        ></div>
      </div>
    </div>

    <div class="tessera-quiz-questions">
      {#each questions as q, i}
        <div class="tessera-quiz-question-wrapper" class:active={i === currentQuestionIndex} aria-hidden={i !== currentQuestionIndex}>
          {#if q.render}
            {@render q.render()}
          {/if}
        </div>
      {/each}
    </div>

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
          class="tessera-quiz-btn tessera-quiz-btn-primary"
          disabled={!answers.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex)}
          onclick={goNextQuestion}
        >
          {feedbackMode === 'immediate' && feedbackShown.has(currentQuestionIndex) ? 'Continue' : 'Next'}
        </button>
      {:else}
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary tessera-quiz-btn-submit"
          disabled={!allAnswered}
          onclick={feedbackMode === 'immediate' && !feedbackShown.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex) ? () => { feedbackShown = new Set([...feedbackShown, currentQuestionIndex]); } : handleSubmit}
        >
          {feedbackMode === 'immediate' && answers.has(currentQuestionIndex) && !feedbackShown.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex) ? 'Check Answer' : 'Submit'}
        </button>
      {/if}
    </div>

  {:else if reviewing}
    <!-- Review phase -->
    <div class="tessera-quiz-progress" aria-live="polite">
      <span class="tessera-quiz-progress-text">
        <span class="tessera-quiz-progress-desktop">Review: Question {reviewIndex + 1} of {totalQuestions}</span>
        <span class="tessera-quiz-progress-mobile">Review: {reviewIndex + 1}/{totalQuestions}</span>
      </span>
    </div>

    <div class="tessera-quiz-questions">
      {#each questions as q, i}
        <div class="tessera-quiz-question-wrapper" class:active={i === reviewIndex} aria-hidden={i !== reviewIndex}>
          {#if q.render}
            {@render q.render()}
          {/if}
        </div>
      {/each}
    </div>

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
          class="tessera-quiz-btn tessera-quiz-btn-primary"
          onclick={goNextReview}
        >
          Next
        </button>
      {:else}
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary"
          onclick={exitReview}
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
        <span class="tessera-quiz-score-value">{score}%</span>
        <span class="tessera-quiz-score-label" class:passed class:failed={!passed}>
          {passed ? 'Passed' : 'Not Passed'}
        </span>
      </div>
      <p class="tessera-quiz-results-detail">
        You answered {Math.round(score * totalQuestions / 100)} of {totalQuestions} questions correctly.
      </p>

      <div class="tessera-quiz-results-actions">
        {#if showFeedback}
          <button
            class="tessera-quiz-btn tessera-quiz-btn-secondary"
            onclick={startReview}
          >
            Review Answers
          </button>
        {/if}
        {#if canRetry}
          <button
            class="tessera-quiz-btn tessera-quiz-btn-primary"
            onclick={handleRetry}
          >
            Retry Quiz
          </button>
        {/if}
        {#if maxAttempts !== Infinity && attemptCount >= maxAttempts}
          <p class="tessera-quiz-attempts-exhausted">All attempts used ({attemptCount}/{maxAttempts})</p>
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

  .tessera-quiz-progress-bar {
    flex: 1;
    height: 4px;
    background: var(--tessera-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .tessera-quiz-progress-fill {
    height: 100%;
    background: var(--tessera-primary);
    border-radius: 2px;
    transition: width 0.3s ease;
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
    transition: background 0.2s, opacity 0.2s;
    min-height: 44px;
    min-width: 44px;
  }

  .tessera-quiz-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tessera-quiz-btn-primary {
    background: var(--tessera-primary);
    color: #fff;
  }

  .tessera-quiz-btn-primary:hover:not(:disabled) {
    background: var(--tessera-primary-dark);
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
    color: var(--tessera-success);
    background: color-mix(in srgb, var(--tessera-success) 10%, transparent);
  }

  .tessera-quiz-score-label.failed {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 10%, transparent);
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

  .tessera-quiz-locked-banner {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    padding: var(--tessera-spacing-md);
    margin-bottom: var(--tessera-spacing-md);
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--tessera-success) 25%, transparent);
    border-radius: 6px;
    color: var(--tessera-success);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .tessera-quiz-locked-banner svg {
    flex-shrink: 0;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .tessera-quiz-progress-desktop { display: none; }
    .tessera-quiz-progress-mobile { display: inline; }

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
