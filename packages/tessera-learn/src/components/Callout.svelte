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

<div
  class="tessera-callout tessera-callout-{type}"
  role="note"
  aria-label={labels[type]}
>
  <span class="tessera-callout-icon" aria-hidden="true">{icons[type]}</span>
  <div class="tessera-callout-content">
    {@render children?.()}
  </div>
</div>

<style>
  @layer tessera {
    .tessera-callout {
      display: flex;
      gap: var(--tessera-spacing-md);
      padding: var(--tessera-spacing-md) var(--tessera-spacing-lg);
      border-radius: 8px;
      border-left: 4px solid var(--callout-color);
      margin-bottom: var(--tessera-spacing-lg);
      color: var(--tessera-text);
      background-color: color-mix(
        in srgb,
        var(--callout-color) 8%,
        var(--tessera-bg)
      );
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
      --callout-color: var(--tessera-primary);
    }

    .tessera-callout-warning {
      --callout-color: var(--tessera-warning);
    }

    .tessera-callout-tip {
      --callout-color: var(--tessera-success);
    }

    .tessera-callout-important {
      --callout-color: var(--tessera-error);
    }
  }
</style>
