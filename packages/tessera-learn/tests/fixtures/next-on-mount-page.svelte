<script>
  import { onMount } from 'svelte';
  import { useNavigation } from '../../src/runtime/hooks.svelte.js';

  const nav = useNavigation();
  onMount(() => {
    globalThis.__tesseraCanGoNextAtMount = nav.canGoNext;
  });
</script>

<h1>Test page</h1>
