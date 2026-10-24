<script>
  import { tick, untrack } from 'svelte';
  import ResultIcon from './ResultIcon.svelte';
  import RetryButton from './RetryButton.svelte';

  let {
    q,
    class: className = '',
    correctLabel = 'Correct',
    incorrectLabel = 'Incorrect',
    firstControl,
    children,
  } = $props();

  const inQuiz = $derived(q.mode === 'quiz');
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
    class={className}
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
    </div>
    {#if !inQuiz && q.canRetry}
      <RetryButton onclick={retry} />
    {/if}
  </div>
{/if}

<style>
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
</style>
