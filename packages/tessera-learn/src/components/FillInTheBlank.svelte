<script>
  import { untrack } from 'svelte';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { QUESTION_ID_PREFIX, fillInAnswers, questionId } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import QuestionReview from './QuestionReview.svelte';

  /**
   * @type {{
   *   id?: string;
   *   question: string;
   *   answers: string | string[];
   *   caseSensitive?: boolean;
   *   correctFeedback?: string;
   *   incorrectFeedback?: string;
   *   graded?: boolean;
   *   maxRetries?: number;
   *   weight?: number;
   * }}
   */
  let {
    id,
    question,
    answers,
    caseSensitive = false,
    correctFeedback = '',
    incorrectFeedback = '',
    graded,
    maxRetries,
    weight = 1,
  } = $props();

  const answerList = $derived(fillInAnswers(answers));
  let inputValue = $state('');

  const componentId = $props.id();
  const inputId = `fitb-${componentId}`;
  let inputEl = $state(null);

  const q = useQuestion({
    get id() {
      return questionId(id, QUESTION_ID_PREFIX.FillInTheBlank, question);
    },
    graded: untrack(() => graded),
    weight: untrack(() => weight),
    maxRetries: untrack(() => maxRetries),
    complete: () => inputValue.trim() !== '',
    response: () => ({
      type: 'fill-in',
      response: inputValue.trim(),
      correct: answerList,
      caseMatters: !!caseSensitive,
    }),
    reset: () => {
      inputValue = '';
    },
    restore: (response) => {
      inputValue = String(response);
      return inputValue;
    },
  });

  // `q.mode` is fixed for the lifetime of the widget; capture once.
  const inQuiz = q.mode === 'quiz';

  function handleInput(e) {
    if (q.locked) return;
    inputValue = e.target.value;
    q.setAnswer(inputValue);
  }

  function handleKeydown(e) {
    if (inQuiz || q.submitted) return;
    if (e.key === 'Enter' && q.answerComplete) q.submit();
  }
</script>

<QuestionShell {q} class="tessera-fitb">
  <label class="tessera-fitb-question" for={inputId}>{question}</label>

  <div class="tessera-fitb-input-wrapper">
    <input
      bind:this={inputEl}
      type="text"
      id={inputId}
      class="tessera-fitb-input"
      class:correct={q.feedbackVisible && q.correct}
      class:incorrect={q.feedbackVisible && !q.correct}
      value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      disabled={q.locked}
      placeholder="Type your answer..."
      autocomplete="off"
    />
    {#if !inQuiz && !q.submitted}
      <button
        type="button"
        class="tessera-btn-primary tessera-fitb-check-btn"
        disabled={!q.answerComplete}
        onclick={q.submit}
      >
        Check
      </button>
    {/if}
  </div>

  <QuestionReview {q} class="tessera-fitb-review" firstControl={() => inputEl}>
    {@const isCorrect = q.correct}
    {#if isCorrect}
      {#if correctFeedback}
        <p class="tessera-fitb-feedback correct">{correctFeedback}</p>
      {/if}
    {:else}
      <p class="tessera-fitb-correct-answer">
        Correct answer{answerList.length > 1 ? 's' : ''}: {answerList.join(
          ', ',
        )}
      </p>
      {#if incorrectFeedback}
        <p class="tessera-fitb-feedback incorrect">{incorrectFeedback}</p>
      {/if}
    {/if}
  </QuestionReview>
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

  :global(.tessera-fitb-review) {
    margin-top: var(--tessera-spacing-md);
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
