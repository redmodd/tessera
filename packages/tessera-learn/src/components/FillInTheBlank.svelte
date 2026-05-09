<script>
  import { getContext, onMount } from 'svelte';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { slugFromQuestion } from './util.js';

  let {
    id,
    question,
    answers,
    caseSensitive = false,
    correctFeedback = '',
    incorrectFeedback = '',
    maxRetries = Infinity,
    weight = 1,
  } = $props();

  const quiz = getContext('tessera-quiz');
  const standalone = !quiz;

  let inputValue = $state('');
  let saRetryCount = $state(0);
  let saCanRetry = $derived(saRetryCount < maxRetries);

  const componentId = $props.id();
  const inputId = `fitb-${componentId}`;
  const defaultId = `fitb-${slugFromQuestion(question)}`;

  function checkAnswer(userAnswer) {
    if (!userAnswer || typeof userAnswer !== 'string') return false;
    const trimmed = userAnswer.trim();
    return answers.some(acceptable => {
      const a = acceptable.trim();
      if (caseSensitive) return trimmed === a;
      return trimmed.toLowerCase() === a.toLowerCase();
    });
  }

  const handle = useQuestion({
    id: id ?? defaultId,
    weight,
    response: () => ({
      type: 'fill-in',
      response: inputValue,
      correct: Array.isArray(answers) ? answers : [answers],
      caseMatters: !!caseSensitive,
    }),
    reset: () => { inputValue = ''; },
  });

  const myIndex = $derived(handle.quizIndex ?? -1);

  onMount(() => {
    if (!standalone) quiz.setRender(myIndex, renderQuestion);
  });

  let isLocked = $derived(standalone ? false : quiz.isLockedCorrect(myIndex));
  let quizLocked = $derived(standalone ? handle.submitted : quiz.isAnswerLocked(myIndex));

  function handleInput(e) {
    if (standalone) {
      if (handle.submitted) return;
      inputValue = e.target.value;
    } else {
      if (quizLocked) return;
      inputValue = e.target.value;
      quiz.setAnswer(myIndex, inputValue);
    }
  }

  function handleKeydown(e) {
    if (!standalone || handle.submitted) return;
    if (e.key === 'Enter' && inputValue.trim()) {
      handle.submit();
    }
  }

  function handleRetry() {
    saRetryCount++;
    inputValue = '';
    handle.reset();
  }
</script>

{#if standalone}
  <div class="tessera-fitb">
    <label class="tessera-fitb-question" for={inputId}>{question}</label>

    <div class="tessera-fitb-input-wrapper">
      <input
        type="text"
        id={inputId}
        class="tessera-fitb-input"
        class:correct={handle.submitted && checkAnswer(inputValue)}
        class:incorrect={handle.submitted && !checkAnswer(inputValue)}
        value={inputValue}
        oninput={handleInput}
        onkeydown={handleKeydown}
        disabled={handle.submitted}
        placeholder="Type your answer..."
        autocomplete="off"
      />
      {#if !handle.submitted}
        <button
          class="tessera-fitb-check-btn"
          disabled={!inputValue.trim()}
          onclick={() => { handle.submit(); }}
        >
          Check
        </button>
      {/if}
    </div>

    {#if handle.submitted}
      {@const isCorrect = checkAnswer(inputValue)}
      <div class="tessera-fitb-review">
        {#if isCorrect}
          <div class="tessera-fitb-result correct">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Correct
          </div>
          {#if correctFeedback}
            <p class="tessera-fitb-feedback correct">{correctFeedback}</p>
          {/if}
        {:else}
          <div class="tessera-fitb-result incorrect">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
            </svg>
            Incorrect
          </div>
          <p class="tessera-fitb-correct-answer">
            Correct answer{answers.length > 1 ? 's' : ''}: {answers.join(', ')}
          </p>
          {#if incorrectFeedback}
            <p class="tessera-fitb-feedback incorrect">{incorrectFeedback}</p>
          {/if}
        {/if}
        {#if saCanRetry}
          <button class="tessera-standalone-retry" onclick={handleRetry}>Try again</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#snippet renderQuestion()}
  <div class="tessera-fitb">
    {#if isLocked}
      <div class="tessera-quiz-locked-banner">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        You already got this one right — click Next to continue.
      </div>
    {/if}
    <label class="tessera-fitb-question" for={inputId}>{question}</label>

    <div class="tessera-fitb-input-wrapper">
      <input
        type="text"
        id={inputId}
        class="tessera-fitb-input"
        class:correct={quiz.feedbackVisible(myIndex) && checkAnswer(quiz.getAnswer(myIndex))}
        class:incorrect={quiz.feedbackVisible(myIndex) && !checkAnswer(quiz.getAnswer(myIndex))}
        value={quizLocked ? (quiz.getAnswer(myIndex) ?? '') : inputValue}
        oninput={handleInput}
        disabled={quizLocked}
        placeholder="Type your answer..."
        autocomplete="off"
      />
    </div>

    {#if quiz.feedbackVisible(myIndex)}
      {@const userAnswer = quiz.getAnswer(myIndex)}
      {@const isCorrect = checkAnswer(userAnswer)}
      <div class="tessera-fitb-review">
        {#if isCorrect}
          <div class="tessera-fitb-result correct">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Correct
          </div>
          {#if correctFeedback}
            <p class="tessera-fitb-feedback correct">{correctFeedback}</p>
          {/if}
        {:else}
          <div class="tessera-fitb-result incorrect">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
            </svg>
            Incorrect
          </div>
          <p class="tessera-fitb-correct-answer">
            Correct answer{answers.length > 1 ? 's' : ''}: {answers.join(', ')}
          </p>
          {#if incorrectFeedback}
            <p class="tessera-fitb-feedback incorrect">{incorrectFeedback}</p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .tessera-fitb {
    padding: var(--tessera-spacing-md) 0;
  }

  .tessera-fitb-question {
    display: block;
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--tessera-spacing-lg);
    color: var(--tessera-text);
  }

  .tessera-fitb-input-wrapper {
    max-width: 400px;
  }

  .tessera-fitb-input {
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: 2px solid var(--tessera-border);
    border-radius: 6px;
    font-size: 1rem;
    font-family: var(--tessera-font-family);
    color: var(--tessera-text);
    background: var(--tessera-bg);
    transition: border-color 0.2s;
    min-height: 44px;
  }

  .tessera-fitb-input:focus {
    outline: none;
    border-color: var(--tessera-primary);
    box-shadow: var(--tessera-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.4));
  }

  .tessera-fitb-input:disabled {
    background: var(--tessera-bg-secondary);
    cursor: not-allowed;
  }

  .tessera-fitb-input.correct {
    border-color: var(--tessera-success);
  }

  .tessera-fitb-input.incorrect {
    border-color: var(--tessera-error);
  }

  .tessera-fitb-review {
    margin-top: var(--tessera-spacing-md);
  }

  .tessera-fitb-result {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: var(--tessera-spacing-sm);
  }

  .tessera-fitb-result.correct {
    color: var(--tessera-success);
  }

  .tessera-fitb-result.incorrect {
    color: var(--tessera-error);
  }

  .tessera-fitb-correct-answer {
    font-size: 0.875rem;
    color: var(--tessera-text-light);
    margin-bottom: var(--tessera-spacing-sm);
  }

  .tessera-fitb-feedback {
    font-size: 0.875rem;
    padding: var(--tessera-spacing-sm) var(--tessera-spacing-md);
    border-radius: 4px;
  }

  .tessera-fitb-feedback.correct {
    color: var(--tessera-success);
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
  }

  .tessera-fitb-feedback.incorrect {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 8%, transparent);
  }

  .tessera-fitb-check-btn {
    margin-top: var(--tessera-spacing-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #fff;
    background: var(--tessera-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    min-height: 44px;
    transition: background 0.2s, opacity 0.2s;
  }

  .tessera-fitb-check-btn:hover:not(:disabled) {
    background: var(--tessera-primary-dark);
  }

  .tessera-fitb-check-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tessera-standalone-retry {
    display: inline-block;
    margin-top: var(--tessera-spacing-md);
    padding: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--tessera-primary);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .tessera-standalone-retry:hover {
    color: var(--tessera-primary-dark);
  }

  @media (max-width: 640px) {
    .tessera-fitb-input-wrapper {
      max-width: 100%;
    }
  }
</style>
