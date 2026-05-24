<script>
  /**
   * @component AccordionItem
   * Expandable panel within an Accordion. Uses context for single-open control.
   *
   * @prop {string} title - Header text
   * @prop {import('svelte').Snippet} [children] - Panel content
   */
  import { getContext } from 'svelte';

  let { title, children } = $props();
  const id = $props.id();
  const headerId = `tessera-accordion-header-${id}`;
  const panelId = `tessera-accordion-panel-${id}`;

  const accordion = getContext('tessera-accordion');
  let isOpen = $derived(accordion.openId === id);

  function toggle() {
    accordion.toggle(id);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<div class="tessera-accordion-item">
  <button
    class="tessera-accordion-trigger"
    id={headerId}
    aria-expanded={isOpen}
    aria-controls={panelId}
    onclick={toggle}
    onkeydown={handleKeydown}
  >
    <span class="tessera-accordion-trigger-text">{title}</span>
    <svg
      class="tessera-accordion-chevron"
      class:open={isOpen}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  </button>

  <div
    class="tessera-accordion-panel"
    class:open={isOpen}
    id={panelId}
    role="region"
    aria-labelledby={headerId}
    aria-hidden={!isOpen}
  >
    <div class="tessera-accordion-panel-content">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .tessera-accordion-item {
    border-bottom: 1px solid var(--tessera-border);
  }

  .tessera-accordion-item:last-child {
    border-bottom: none;
  }

  .tessera-accordion-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--tessera-spacing-md) var(--tessera-spacing-lg);
    font-size: 1rem;
    font-weight: 600;
    color: var(--tessera-text);
    background: var(--tessera-bg);
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color var(--tessera-transition-fast);
  }

  .tessera-accordion-trigger:hover {
    background-color: var(--tessera-bg-secondary);
  }

  .tessera-accordion-trigger:focus-visible {
    box-shadow: var(--tessera-focus-ring);
    outline: none;
    z-index: 1;
    position: relative;
  }

  .tessera-accordion-trigger-text {
    flex: 1;
    min-width: 0;
  }

  .tessera-accordion-chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    transition: transform var(--tessera-transition-fast);
  }

  .tessera-accordion-chevron.open {
    transform: rotate(180deg);
  }

  .tessera-accordion-panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--tessera-transition-normal);
    visibility: hidden;
  }

  .tessera-accordion-panel.open {
    grid-template-rows: 1fr;
    visibility: visible;
  }

  .tessera-accordion-panel-content {
    overflow: hidden;
    padding: 0 var(--tessera-spacing-lg);
  }

  .tessera-accordion-panel.open .tessera-accordion-panel-content {
    padding: var(--tessera-spacing-md) var(--tessera-spacing-lg);
  }
</style>
