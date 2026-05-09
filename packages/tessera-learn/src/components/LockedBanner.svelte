<script>
  // Shown above a question that's locked from a prior correct attempt during
  // an `incorrect-only` retry. Same SVG / copy used by every question type so
  // the visual signal is consistent across MC, FITB, Matching, Sorting.
  let { message = 'You already got this one right — click Next to continue.' } = $props();
</script>

<div class="tessera-quiz-locked-banner">
  <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
  </svg>
  {message}
</div>

<style>
  .tessera-quiz-locked-banner {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    padding: var(--tessera-spacing-md);
    margin-bottom: var(--tessera-spacing-md);
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--tessera-success) 25%, transparent);
    border-radius: 6px;
    color: var(--tessera-success);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .tessera-quiz-locked-banner svg {
    flex-shrink: 0;
  }
</style>
