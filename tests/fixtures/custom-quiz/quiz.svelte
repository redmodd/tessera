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
    state: {quiz.state} · score: {quiz.score} · attempts: {quiz.attemptCount}
  </div>

  <!-- All questions stacked. Each question widget calls useQuestion which
       registers its render snippet with the Quiz context. -->
  <ol class="custom-quiz-list">
    {#each quiz.questions as q (q.id)}
      <li class="custom-quiz-item" data-question-id={q.id}>
        {#if q.render}
          {@render q.render()}
        {/if}
      </li>
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
      <button
        type="button"
        data-testid="custom-quiz-review"
        onclick={() => quiz.startReview()}
      >
        Review
      </button>
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

  <!-- Children mounted hidden so question widgets stay alive across submit/review. -->
  <div style="display:none">
    {@render children?.()}
  </div>
</div>

<style>
  .custom-quiz { padding: 1rem; }
  .custom-quiz-status { font-family: monospace; margin-bottom: 1rem; }
  .custom-quiz-list { padding-left: 1.5rem; }
  .custom-quiz-item { margin-bottom: 1rem; }
  .custom-quiz-actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
</style>
