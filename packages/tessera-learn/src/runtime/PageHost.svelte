<script>
  import { onMount } from 'svelte';
  import { setInPage } from './contexts.js';

  let { onmount, children } = $props();

  setInPage(true);
  onMount(() => onmount());
</script>

{@render children()}
