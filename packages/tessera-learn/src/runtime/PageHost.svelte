<script>
  import { setInPage } from './contexts.js';

  let { children } = $props();

  setInPage(true);
</script>

{@render children()}
