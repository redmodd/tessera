<script>
  import { getNavContext } from '../../src/runtime/contexts.js';
  import LayoutCheck from './layout-check.svelte';

  let { page } = $props();
  let late = $state(false);
  globalThis.__tesseraNavCtx = getNavContext();
  globalThis.__showLateCheck = () => (late = true);
</script>

<LayoutCheck id="layout-check" />
{@render page()}
{#if late}
  <LayoutCheck id="late-check" />
{/if}
