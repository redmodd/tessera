<script>
  /**
   * @component Accordion
   * Container for AccordionItem components. Only one item open at a time.
   *
   * @prop {import('svelte').Snippet} [children] - AccordionItem children
   */
  import { setContext } from 'svelte';

  let { children } = $props();
  let openId = $state(null);

  setContext('tessera-accordion', {
    get openId() { return openId; },
    toggle(id) {
      openId = openId === id ? null : id;
    },
  });
</script>

<div class="tessera-accordion">
  {@render children?.()}
</div>

<style>
  .tessera-accordion {
    border: 1px solid var(--tessera-border);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: var(--tessera-spacing-lg);
  }
</style>
