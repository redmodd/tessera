<script>
  import { useProgress } from '../../src/runtime/hooks.svelte.js';
  import {
    getNavContext,
    getUserStateStore,
  } from '../../src/runtime/contexts.js';

  let { page } = $props();
  const progress = useProgress();
  globalThis.__tesseraNavCtx = getNavContext();
  globalThis.__tesseraUserState = getUserStateStore();

  $effect(() => {
    globalThis.__tesseraSeenPassingScore?.push(progress.passingScore);
  });
</script>

{@render page()}
