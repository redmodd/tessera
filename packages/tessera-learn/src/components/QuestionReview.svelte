<script>
  import { tick, untrack } from 'svelte';
  import ResultIcon from './ResultIcon.svelte';

  let {
    q,
    class: className = '',
    correctLabel = 'Correct',
    incorrectLabel = 'Incorrect',
    correctFeedback = '',
    incorrectFeedback = '',
    firstControl,
    children,
  } = $props();

  const inQuiz = $derived(q.mode === 'quiz');
  const feedback = $derived(q.correct ? correctFeedback : incorrectFeedback);
  const contentId = $props.id();
  // Feedback showing at mount is a restored answer, not a fresh check.
  let restored = untrack(() => q.feedbackVisible);

  // Review never takes focus: a custom quiz shell may keep every question mounted.
  function focusOnCheck(el) {
    const review = untrack(() => inQuiz && q.submitted);
    if (!restored && !review) el.focus();
    restored = false;
  }

  async function retry() {
    q.retry();
    await tick();
    firstControl()?.focus();
  }
</script>

{#if q.feedbackVisible}
  <!-- Named by its text: VoiceOver in Safari reads an unnamed focused block as
       only its first line ("Incorrect and 2 more items"). -->
  <div
    class="tessera-question-review {className}"
    role="group"
    aria-labelledby={contentId}
    tabindex="-1"
    {@attach focusOnCheck}
  >
    <div id={contentId}>
      <div
        class="tessera-question-result"
        class:correct={q.correct}
        class:incorrect={!q.correct}
      >
        <ResultIcon kind={q.correct ? 'correct' : 'incorrect'} />
        {q.correct ? correctLabel : incorrectLabel}
      </div>
      {@render children?.()}
      {#if feedback}
        <p
          class="tessera-question-feedback"
          class:correct={q.correct}
          class:incorrect={!q.correct}
        >
          {feedback}
        </p>
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
  .tessera-question-review {
    margin-top: var(--tessera-spacing-md);
  }

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
</style>
