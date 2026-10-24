<script>
  import { tick, untrack } from 'svelte';
  import RetryButton from './RetryButton.svelte';

  // The result block for the question widgets. In a quiz, feedback shown before
  // submit (immediate mode) sits in a status region; review does not, since a
  // shell may keep every question mounted. Standalone, Check and Try again
  // disable or remove the focused control, so focus moves to the result, then
  // back to the control `firstControl` returns.
  let { q, class: className = '', firstControl, children } = $props();

  const inQuiz = $derived(q.mode === 'quiz');
  // Feedback showing at mount is a restored answer, not a fresh check.
  let restored = untrack(() => q.feedbackVisible);

  function focusOnCheck(el) {
    if (!restored && !inQuiz) el.focus();
    restored = false;
  }

  async function retry() {
    q.retry();
    await tick();
    firstControl()?.focus();
  }
</script>

<div role={inQuiz && !q.submitted ? 'status' : undefined}>
  {#if q.feedbackVisible}
    <div class={className} tabindex="-1" {@attach focusOnCheck}>
      {@render children()}
      {#if !inQuiz && q.canRetry}
        <RetryButton onclick={retry} />
      {/if}
    </div>
  {/if}
</div>
