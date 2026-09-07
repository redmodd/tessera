<script>
  import { useProgress } from '../../src/runtime/hooks.svelte.js';
  import { getNavContext } from '../../src/runtime/contexts.js';

  let { page } = $props();
  const progress = useProgress();
  globalThis.__tesseraNavCtx = getNavContext();

  $effect(() => {
    globalThis.__tesseraSeenPassingScore.push(progress.passingScore);
  });
</script>

{@render page()}
