<script>
  import { tick, untrack } from 'svelte';
  import RetryButton from './RetryButton.svelte';

  // The result block for the question widgets. In a quiz, feedback shown before
  // submit (immediate mode) sits in a status region; review does not, since a
  // shell may keep every question mounted. Standalone, Check and Try again
  // disable or remove the focused control, so focus moves to the result, then
  // back to the control `firstControl` returns. The result is a group named by
  // its own text: VoiceOver in Safari reads an unnamed focused block as only its
  // first line ("Incorrect and 2 more items").
  let { q, class: className = '', firstControl, children } = $props();

  const inQuiz = $derived(q.mode === 'quiz');
  const contentId = $props.id();
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
</div>
