<script>
  // Deliberately weird quiz shell — one page, all questions visible at once,
  // single Submit button, no built-in Quiz CSS classes. Proves the public
  // useQuiz()/useQuestion() data contract is enough to build any UX while
  // still reporting identically to all four LMS adapters.
  import { useQuiz } from 'tessera-learn';

  let { children } = $props();
  let host;

  const quiz = useQuiz({ element: () => host });
</script>

<div bind:this={host} class="custom-quiz" data-testid="custom-quiz">
  <div class="custom-quiz-status" data-testid="custom-quiz-status">
    state: {quiz.state} · score: {quiz.score} · best: {quiz.bestScore} · attempts:
    {quiz.attemptCount}
  </div>

  <!-- Inline layout: page markup renders in place, so widgets that skip
       setRender appear in document order between the page's own prose. -->
  <div class="custom-quiz-page" data-testid="custom-quiz-page">
    {@render children?.()}
  </div>

  <!-- Snippet layout: widgets that registered a snippet render here instead. -->
  <ol class="custom-quiz-list">
    {#each quiz.questions as q (q.id)}
      {#if q.render}
        <li class="custom-quiz-item" data-question-id={q.id}>
          {@render q.render()}
        </li>
      {/if}
    {/each}
  </ol>

  <div class="custom-quiz-actions">
    {#if quiz.state === 'answering'}
      <button
        type="button"
        data-testid="custom-quiz-submit"
        disabled={!quiz.canSubmit}
        onclick={() => quiz.submit()}
      >
        Submit All
      </button>
    {:else if quiz.state === 'submitted'}
      {#if !quiz.restored}
        <button
          type="button"
          data-testid="custom-quiz-review"
          onclick={() => quiz.startReview()}
        >
          Review
        </button>
      {/if}
      {#if quiz.canRetry}
        <button
          type="button"
          data-testid="custom-quiz-retry"
          onclick={() => quiz.retry()}
        >
          Retry
        </button>
      {/if}
    {:else if quiz.state === 'reviewing'}
      <button
        type="button"
        data-testid="custom-quiz-exit-review"
        onclick={() => quiz.exitReview()}
      >
        Done Reviewing
      </button>
    {/if}
  </div>
</div>

<style>
  .custom-quiz {
    padding: 1rem;
  }
  .custom-quiz-status {
    font-family: monospace;
    margin-bottom: 1rem;
  }
  .custom-quiz-list {
    padding-left: 1.5rem;
  }
  .custom-quiz-item {
    margin-bottom: 1rem;
  }
  .custom-quiz-page :global(p) {
    margin: 0.75rem 0;
  }
  .custom-quiz-actions {
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
  }
</style>
