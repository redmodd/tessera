<script>
  let { error, onretry } = $props();
</script>

<div class="tessera-error" role="alert">
  <h2>This page failed to load</h2>
  <p>Try navigating to another page or refreshing the browser.</p>
  {#if error?.message}
    <p><small>{error.message}</small></p>
  {/if}
  <button class="tessera-btn-primary tessera-error-retry" onclick={onretry}>
    Retry
  </button>
</div>
