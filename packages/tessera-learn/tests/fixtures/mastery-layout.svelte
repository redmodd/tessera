<script>
  import { useProgress } from '../../src/runtime/hooks.svelte.js';

  let { page } = $props();
  const progress = useProgress();

  $effect(() => {
    globalThis.__tesseraSeenPassingScore.push(progress.passingScore);
  });
</script>

{@render page()}
