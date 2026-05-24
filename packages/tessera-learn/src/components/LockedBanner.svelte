<script>
  import ResultIcon from './ResultIcon.svelte';
  let { message = 'You already got this one right — click Next to continue.' } =
    $props();
</script>

<div class="tessera-quiz-locked-banner">
  <ResultIcon kind="correct" />
  {message}
</div>

<style>
  .tessera-quiz-locked-banner {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    padding: var(--tessera-spacing-md);
    margin-bottom: var(--tessera-spacing-md);
    background: var(--tessera-success-bg);
    border: 1px solid var(--tessera-success-border);
    border-radius: 6px;
    color: var(--tessera-success);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .tessera-quiz-locked-banner :global(svg) {
    flex-shrink: 0;
  }
</style>
