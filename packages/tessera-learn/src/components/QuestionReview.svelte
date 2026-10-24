<script>
  import { tick, untrack } from 'svelte';
  import RetryButton from './RetryButton.svelte';

  // The result block for the question widgets. A fresh result takes focus,
  // standalone after Check and in a quiz when immediate mode reveals it, so it
  // is read out and the next Tab reaches the next control. Try again sends
  // focus back to the control `firstControl` returns. Review after a quiz is
  // submitted never takes focus: a shell may keep every question mounted.
  // The result is a group named by its own text: VoiceOver in Safari reads an
  // unnamed focused block as only its first line ("Incorrect and 2 more items").
  let { q, class: className = '', firstControl, children } = $props();

  const inQuiz = $derived(q.mode === 'quiz');
  const contentId = $props.id();
  // Feedback showing at mount is a restored answer, not a fresh check.
  let restored = untrack(() => q.feedbackVisible);

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
  <div
    class={className}
    role="group"
    aria-labelledby={contentId}
    tabindex="-1"
    {@attach focusOnCheck}
  >
    <div id={contentId}>{@render children()}</div>
    {#if !inQuiz && q.canRetry}
      <RetryButton onclick={retry} />
    {/if}
  </div>
{/if}
