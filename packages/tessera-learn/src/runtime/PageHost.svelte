<script>
  import { setContext } from 'svelte';
  import { TESSERA_IN_PAGE } from './contexts.js';

  let { children } = $props();

  setContext(TESSERA_IN_PAGE, true);
</script>

{@render children()}
