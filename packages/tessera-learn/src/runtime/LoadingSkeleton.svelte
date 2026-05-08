<script>
  import { onMount } from 'svelte';

  let showSlowMessage = $state(false);
  let timer;

  onMount(() => {
    timer = setTimeout(() => {
      showSlowMessage = true;
    }, 5000);

    return () => clearTimeout(timer);
  });
</script>

<div class="tessera-skeleton" aria-busy="true" aria-label="Loading page content">
  <div class="tessera-skeleton-line"></div>
  <div class="tessera-skeleton-line"></div>
  <div class="tessera-skeleton-line"></div>
  <div class="tessera-skeleton-line"></div>
  <div class="tessera-skeleton-line"></div>
  <div class="tessera-skeleton-line"></div>
  {#if showSlowMessage}
    <p class="tessera-skeleton-message">Still loading…</p>
  {/if}
</div>
