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
    <h1>Session ended</h1>
    <p>You can close this window.</p>
  {:else}
    <h1>Ending session…</h1>
    <p>Saving your progress.</p>
  {/if}
</div>
