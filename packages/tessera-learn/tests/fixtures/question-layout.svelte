<script>
  import { useQuestion } from '../../src/runtime/hooks.svelte.js';
  import { getNavContext } from '../../src/runtime/contexts.js';

  let { page } = $props();
  globalThis.__tesseraNavCtx = getNavContext();

  useQuestion({
    id: 'layout-check',
    graded: true,
    response: () => ({ type: 'true-false', response: true, correct: true }),
  }).submit();
</script>

{@render page()}
