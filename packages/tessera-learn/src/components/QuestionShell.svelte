<script>
  import { onMount } from 'svelte';
  import LockedBanner from './LockedBanner.svelte';

  // Shared dual-render wrapper for the question widgets: inline when
  // standalone, a snippet the Quiz shell renders when inside a quiz.
  let { q, class: className = '', children, ...rest } = $props();

  const inQuiz = $derived(q.mode === 'quiz');

  onMount(() => {
    if (inQuiz) q.setRender(quizContent);
  });
</script>

{#if !inQuiz}
  <div class="tessera-question-shell {className}" {...rest}>
    {@render children?.()}
  </div>
{/if}

{#snippet quizContent()}
  <div class="tessera-question-shell {className}" {...rest}>
    {#if q.isLockedCorrect}
      <LockedBanner />
    {/if}
    {@render children?.()}
  </div>
{/snippet}

<style>
  .tessera-question-shell {
    padding: var(--tessera-spacing-md) 0;
  }
</style>
