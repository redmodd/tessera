<script>
  import { fade } from 'svelte/transition';
  import { getNavContext } from '../../src/runtime/contexts.js';

  let { page } = $props();
  globalThis.__tesseraNavCtx = getNavContext();
</script>

<div class="fading-layout" transition:fade|global={{ duration: 50 }}>
  {@render page()}
</div>
