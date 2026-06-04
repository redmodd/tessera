<script>
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { questionId } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import ResultIcon from './ResultIcon.svelte';
  import RetryButton from './RetryButton.svelte';

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

  let inputValue = $state('');

  const componentId = $props.id();
  const inputId = `fitb-${componentId}`;

  function checkAnswer(userAnswer) {
    if (!userAnswer || typeof userAnswer !== 'string') return false;
    const trimmed = userAnswer.trim();
    return answers.some((acceptable) => {
      const a = acceptable.trim();
      if (caseSensitive) return trimmed === a;
      return trimmed.toLowerCase() === a.toLowerCase();
    });
  }

  const q = useQuestion({
    get id() {
      return questionId(id, 'fitb', question);
    },
    get weight() {
      return weight;
    },
    get maxRetries() {
      return maxRetries;
    },
    response: () => ({
      type: 'fill-in',
      response: inputValue,
      correct: Array.isArray(answers) ? answers : [answers],
      caseMatters: !!caseSensitive,
    }),
    reset: () => {
      inputValue = '';
    },
  });

  // `q.mode` is fixed for the lifetime of the widget; capture once.
  const inQuiz = q.mode === 'quiz';

  function handleInput(e) {
    if (q.locked) return;
    inputValue = e.target.value;
    if (inQuiz) q.setAnswer(inputValue);
  }

  function handleBlur() {
    if (!inQuiz || q.locked) return;
    if (inputValue.trim()) q.commit();
  }

  function handleKeydown(e) {
    if (inQuiz || q.submitted) return;
    if (e.key === 'Enter' && inputValue.trim()) {
      q.submit();
    }
  }
</script>

<QuestionShell {q} class="tessera-fitb">
  <label class="tessera-fitb-question" for={inputId}>{question}</label>

  <div class="tessera-fitb-input-wrapper">
    <input
      type="text"
      id={inputId}
      class="tessera-fitb-input"
      class:correct={q.feedbackVisible && checkAnswer(inputValue)}
      class:incorrect={q.feedbackVisible && !checkAnswer(inputValue)}
      value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      disabled={q.locked}
      placeholder="Type your answer..."
      autocomplete="off"
    />
    {#if !inQuiz && !q.submitted}
      <button
        class="tessera-btn-primary tessera-fitb-check-btn"
        disabled={!inputValue.trim()}
        onclick={() => {
          q.submit();
        }}
      >
        Check
      </button>
    {/if}
  </div>

  {#if q.feedbackVisible}
    {@const isCorrect = checkAnswer(inputValue)}
    <div class="tessera-fitb-review">
      {#if isCorrect}
        <div class="tessera-fitb-result correct">
          <ResultIcon kind="correct" />
          Correct
        </div>
        {#if correctFeedback}
          <p class="tessera-fitb-feedback correct">{correctFeedback}</p>
        {/if}
      {:else}
        <div class="tessera-fitb-result incorrect">
          <ResultIcon kind="incorrect" />
          Incorrect
        </div>
        <p class="tessera-fitb-correct-answer">
          Correct answer{answers.length > 1 ? 's' : ''}: {answers.join(', ')}
        </p>
        {#if incorrectFeedback}
          <p class="tessera-fitb-feedback incorrect">{incorrectFeedback}</p>
        {/if}
      {/if}
      {#if !inQuiz && q.canRetry}
        <RetryButton onclick={() => q.retry()} />
      {/if}
    </div>
  {/if}
</QuestionShell>

<style>
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
    box-shadow: var(--tessera-focus-ring);
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
    background: var(--tessera-success-bg);
  }

  .tessera-fitb-feedback.incorrect {
    color: var(--tessera-error);
    background: var(--tessera-error-bg);
  }

  .tessera-fitb-check-btn {
    margin-top: var(--tessera-spacing-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .tessera-fitb-input-wrapper {
      max-width: 100%;
    }
  }
</style>
