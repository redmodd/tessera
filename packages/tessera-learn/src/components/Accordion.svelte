<script module>
  import { createContext } from 'svelte';

  /** @type {ReturnType<typeof createContext<{ readonly openId: string | null; toggle(id: string): void }>>} */
  export const [getAccordionContext, setAccordionContext] = createContext();
</script>

<script>
  /**
   * @component Accordion
   * Container for AccordionItem components. Only one item open at a time.
   *
   * @prop {import('svelte').Snippet} [children] - AccordionItem children
   */
  let { children } = $props();
  let openId = $state(null);

  setAccordionContext({
    get openId() {
      return openId;
    },
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
