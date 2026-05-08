<script>
  /**
   * @component Callout
   * Styled box with icon for info, warning, tip, or important messages.
   *
   * @prop {("info"|"warning"|"tip"|"important")} type - Visual style variant
   * @prop {import('svelte').Snippet} [children] - Content
   */
  let { type = 'info', children } = $props();

  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    tip: '💡',
    important: '❗',
  };

  const labels = {
    info: 'Information',
    warning: 'Warning',
    tip: 'Tip',
    important: 'Important',
  };
</script>

<div class="tessera-callout tessera-callout-{type}" role="note" aria-label={labels[type]}>
  <span class="tessera-callout-icon" aria-hidden="true">{icons[type]}</span>
  <div class="tessera-callout-content">
    {@render children?.()}
  </div>
</div>

<style>
  .tessera-callout {
    display: flex;
    gap: var(--tessera-spacing-md);
    padding: var(--tessera-spacing-md) var(--tessera-spacing-lg);
    border-radius: 8px;
    border-left: 4px solid;
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-callout-icon {
    flex-shrink: 0;
    font-size: 1.25rem;
    line-height: 1.6;
  }

  .tessera-callout-content {
    flex: 1;
    min-width: 0;
  }

  .tessera-callout-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .tessera-callout-info {
    background-color: #eff6ff;
    border-left-color: var(--tessera-primary);
    color: var(--tessera-text);
  }

  .tessera-callout-warning {
    background-color: #fffbeb;
    border-left-color: var(--tessera-warning);
    color: var(--tessera-text);
  }

  .tessera-callout-tip {
    background-color: #f0fdf4;
    border-left-color: var(--tessera-success);
    color: var(--tessera-text);
  }

  .tessera-callout-important {
    background-color: #fef2f2;
    border-left-color: var(--tessera-error);
    color: var(--tessera-text);
  }
</style>
