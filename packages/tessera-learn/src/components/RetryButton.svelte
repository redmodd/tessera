<script>
  // Standalone "Try again" button used by every question type (MC, FITB,
  // Matching, Sorting). Styling is identical across all four; centralizing
  // here keeps the visual signal consistent and removes a 15-line CSS rule
  // from each component.
  let { onclick, label = 'Try again' } = $props();
</script>

<button class="tessera-standalone-retry" {onclick}>{label}</button>

<style>
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
