<script>
  import { useCompletion } from '../../src/runtime/hooks.svelte.js';

  let { page } = $props();
  useCompletion().markComplete();
</script>

{@render page()}
