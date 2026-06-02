<script>
  let { children, onclick, variant = 'primary' } = $props();
</script>

<button class="shared-button {variant}" {onclick}>
  {@render children?.()}
</button>

<style>
  .shared-button {
    font: inherit;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .primary {
    background: var(--shared-color-primary, #0066cc);
    color: white;
  }
</style>
