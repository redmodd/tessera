<script>
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    throw new Error('teardown failed');
  });
</script>

<h1>Leaving page</h1>
