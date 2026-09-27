<script>
  let { ended } = $props();
</script>

<div
  class="tessera-session-ended"
  role="status"
  tabindex="-1"
  {@attach (el) => el.focus()}
>
  {#if ended}
    <h2>Session ended</h2>
    <p>You can close this window.</p>
  {:else}
    <h2>Ending session…</h2>
    <p>Saving your progress.</p>
  {/if}
</div>
