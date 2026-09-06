<script>
  import { usePersistence } from '../../src/runtime/hooks.svelte.js';

  let { page } = $props();
  usePersistence('layout-note').set('written-before-ready');
</script>

{@render page()}
