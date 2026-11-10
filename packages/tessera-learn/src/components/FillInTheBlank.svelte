<script>
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { fillInAnswers } from './util.js';
  import { questionOptions } from './question.js';
  import QuestionShell from './QuestionShell.svelte';
  import QuestionReview from './QuestionReview.svelte';

  /**
   * @type {import('./question.js').QuestionProps & {
   *   answers: string | string[];
   *   caseSensitive?: boolean;
   *   correctFeedback?: string;
   *   incorrectFeedback?: string;
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
    weight,
  } = $props();

  const answerList = $derived(fillInAnswers(answers));
  let inputValue = $state('');

  const componentId = $props.id();
  const inputId = `fitb-${componentId}`;

  const q = useQuestion(
    questionOptions(() => ({ id, question, graded, weight, maxRetries }), {
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
    }),
  );

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

  <input
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

  <QuestionReview {q} {correctFeedback} {incorrectFeedback}>
    {#if !q.correct}
      <p class="tessera-fitb-correct-answer">
        Correct answer{answerList.length > 1 ? 's' : ''}: {answerList.join(
          ', ',
        )}
      </p>
    {/if}
  </QuestionReview>
</QuestionShell>

<style>
  @layer tessera {
    .tessera-fitb-question {
      display: block;
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: var(--tessera-spacing-lg);
      color: var(--tessera-text);
    }

    .tessera-fitb-input {
      display: block;
      width: 100%;
      max-width: 400px;
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
      border-color: var(--tessera-primary);
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

    .tessera-fitb-correct-answer {
      font-size: 0.875rem;
      color: var(--tessera-text-light);
      margin-bottom: var(--tessera-spacing-sm);
    }
  }
</style>
