<script>
  import { untrack } from 'svelte';

  let { active = false } = $props();

  let visible = $state(false);
  let appeared = $state(false);
  let complete = $state(false);
  let showSlowMessage = $state(false);

  $effect(() => {
    if (active) {
      // Defer the bar so sub-100ms loads never flash. Add `.appear` on the
      // next frame so the CSS transition from width:0 → 90% actually fires.
      const appearTimer = setTimeout(() => {
        visible = true;
        requestAnimationFrame(() => {
          appeared = true;
        });
      }, 100);
      const slowTimer = setTimeout(() => {
        showSlowMessage = true;
      }, 5000);
      return () => {
        clearTimeout(appearTimer);
        clearTimeout(slowTimer);
      };
    }

    // Completing. If the bar never appeared we have nothing to finish.
    // untrack so flipping `visible` doesn't re-trigger this effect.
    if (!untrack(() => visible)) return;
    complete = true;
    const hideTimer = setTimeout(() => {
      visible = false;
      appeared = false;
      complete = false;
      showSlowMessage = false;
    }, 220);
    return () => clearTimeout(hideTimer);
  });
</script>

{#if visible}
  <div
    class="tessera-loading-bar"
    class:appear={appeared}
    class:complete
    aria-hidden="true"
  >
    <div class="tessera-loading-bar-fill"></div>
  </div>
  {#if showSlowMessage}
    <p class="tessera-loading-bar-message" role="status">Still loading…</p>
  {/if}
{/if}
