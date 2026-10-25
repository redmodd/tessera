<script>
  import { tick, untrack } from 'svelte';
  import ResultIcon from './ResultIcon.svelte';

  /**
   * @component QuestionReview
   * A question's Submit button, result, and Try again, with focus handling.
   * Place it inside the element that wraps the question's controls.
   */
  /**
   * @type {{
   *   q: import('../runtime/hooks.svelte.js').UseQuestionHandle;
   *   correctLabel?: string;
   *   incorrectLabel?: string;
   *   submittedLabel?: string;
   *   correctFeedback?: string;
   *   incorrectFeedback?: string;
   *   children?: import('svelte').Snippet;
   * }}
   */
  let {
    q,
    correctLabel = 'Correct',
    incorrectLabel = 'Incorrect',
    submittedLabel = 'Submitted',
    correctFeedback = '',
    incorrectFeedback = '',
    children,
  } = $props();

  const CONTROL = 'input, select, textarea, button, [tabindex="0"]';

  const inQuiz = $derived(q.mode === 'quiz');
  const result = $derived(
    q.correct === null ? 'submitted' : q.correct ? 'correct' : 'incorrect',
  );
  const label = $derived(
    {
      correct: correctLabel,
      incorrect: incorrectLabel,
      submitted: submittedLabel,
    }[result],
  );
  const feedback = $derived(
    { correct: correctFeedback, incorrect: incorrectFeedback }[result] ?? '',
  );
  const contentId = $props.id();
  // Feedback showing at mount is a restored answer, not a fresh submit.
  let restored = untrack(() => q.feedbackVisible);

  // Review never takes focus: a custom quiz shell may keep every question mounted.
  function focusOnSubmit(el) {
    const review = untrack(() => inQuiz && q.submitted);
    if (!restored && !review) el.focus();
    restored = false;
  }

  async function retry(e) {
    const container = e.currentTarget.closest(
      '.tessera-question-review',
    ).parentElement;
    q.retry();
    await tick();
    // A hidden, disabled, or inert control ignores focus(); fall through to the next.
    const focused = [...container.querySelectorAll(CONTROL)].some((el) => {
      el.focus();
      return document.activeElement === el;
    });
    if (import.meta.env?.DEV) warnPlacement(container, focused);
  }

  function warnPlacement(container, focused) {
    const reviews = container.querySelectorAll(
      '.tessera-question-submit, .tessera-question-review',
    );
    const problem = !focused
      ? 'has no control that takes focus'
      : container.matches('.tessera-page')
        ? 'is the page'
        : reviews.length > 1
          ? 'holds another question'
          : null;
    if (problem) {
      console.warn(
        '[tessera] QuestionReview: Try again focuses the first control in its ' +
          `parent element, which ${problem}. Put the question's controls and ` +
          'QuestionReview directly inside one element.',
      );
    }
  }
</script>

{#if !inQuiz && !q.submitted}
  <button
    type="button"
    class="tessera-btn-primary tessera-question-submit"
    disabled={!q.answerComplete}
    onclick={q.submit}
  >
    Submit
  </button>
{/if}

{#if q.feedbackVisible}
  <!-- Named by its text: VoiceOver in Safari reads an unnamed focused block as
       only its first line ("Incorrect and 2 more items"). -->
  <div
    class="tessera-question-review"
    role="group"
    aria-labelledby={contentId}
    tabindex="-1"
    {@attach focusOnSubmit}
  >
    <div id={contentId}>
      <div class="tessera-question-result {result}">
        {#if result !== 'submitted'}<ResultIcon kind={result} />{/if}
        {label}
      </div>
      {@render children?.()}
      {#if feedback}
        <p class="tessera-question-feedback {result}">{feedback}</p>
      {/if}
    </div>
    {#if !inQuiz && q.canRetry}
      <button type="button" class="tessera-standalone-retry" onclick={retry}
        >Try again</button
      >
    {/if}
  </div>
{/if}

<style>
  @layer tessera {
    .tessera-question-result {
      display: flex;
      align-items: center;
      gap: var(--tessera-spacing-sm);
      font-weight: 600;
      font-size: 0.9375rem;
      margin-bottom: var(--tessera-spacing-sm);
    }

    .tessera-question-result.correct {
      color: var(--tessera-success);
    }

    .tessera-question-result.incorrect {
      color: var(--tessera-error);
    }

    .tessera-question-feedback {
      font-size: 0.9375rem;
      padding: var(--tessera-spacing-md);
      border-radius: 6px;
      margin-top: var(--tessera-spacing-sm);
    }

    .tessera-question-feedback.correct {
      color: var(--tessera-success);
      background: var(--tessera-success-bg);
    }

    .tessera-question-feedback.incorrect {
      color: var(--tessera-error);
      background: var(--tessera-error-bg);
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
  }
</style>
