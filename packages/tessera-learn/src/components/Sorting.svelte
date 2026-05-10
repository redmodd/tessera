<script>
  import { getContext, onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { slugFromQuestion, shuffle } from './util.js';
  import LockedBanner from './LockedBanner.svelte';
  import ResultIcon from './ResultIcon.svelte';
  import RetryButton from './RetryButton.svelte';

  let {
    id,
    question,
    items,
    targets,
    correct,
    correctFeedback = '',
    incorrectFeedback = '',
    maxRetries = Infinity,
    weight = 1,
  } = $props();

  const quiz = getContext('tessera-quiz');
  const standalone = !quiz;

  let queue = $state([]);              // item indices not yet placed; queue[0] is current
  let placements = $state(new SvelteMap()); // itemIdx → targetIdx
  let dragOver = $state(null);         // target index highlighted during drag
  let isDragging = $state(false);
  let cardSelected = $state(false);    // current card selected via tap/click

  function initQueue() {
    queue = shuffle(items.map((_, i) => i));
    placements = new SvelteMap();
    cardSelected = false;
    dragOver = null;
    isDragging = false;
  }

  if (standalone) {
    initQueue();
  } else {
    onMount(() => {
      initQueue();
      quiz.setRender(myIndex, renderQuestion);
    });
  }

  function checkAnswer(answer) {
    if (!answer || !(answer instanceof Map)) return false;
    if (answer.size !== items.length) return false;
    for (let i = 0; i < items.length; i++) {
      if (answer.get(i) !== correct[i]) return false;
    }
    return true;
  }

  function resetState() {
    initQueue();
  }

  // Sorting is semantically a categorization (each item → one target) and maps
  // cleanly to SCORM 2004's `matching` interaction. We emit [itemIdx, targetIdx]
  // pairs as stringified ids.
  const handle = useQuestion({
    get id() { return id ?? `sorting-${slugFromQuestion(question)}`; },
    get weight() { return weight; },
    get maxRetries() { return maxRetries; },
    response: () => ({
      type: 'matching',
      response: [...placements.entries()].map(([i, t]) => [String(i), String(t)]),
      correct: items.map((_, i) => [String(i), String(correct[i])]),
    }),
    reset: resetState,
  });

  const myIndex = $derived(handle.quizIndex ?? -1);

  let currentItemIdx = $derived(queue.length > 0 ? queue[0] : null);

  let isLocked = $derived(standalone ? false : quiz.isLockedCorrect(myIndex));
  let isDisabled = $derived(standalone ? handle.submitted : quiz.isAnswerLocked(myIndex));
  let showFeedback = $derived(standalone ? handle.submitted : quiz.feedbackVisible(myIndex));

  function getItemsForTarget(targetIdx) {
    const result = [];
    for (const [itemIdx, tIdx] of placements) {
      if (tIdx === targetIdx) result.push(itemIdx);
    }
    return result;
  }

  function isCorrectPlacement(itemIdx) {
    return placements.get(itemIdx) === correct[itemIdx];
  }

  function placeCard(targetIdx) {
    if (isDisabled || currentItemIdx === null) return;
    const itemIdx = queue[0];
    placements.set(itemIdx, targetIdx);
    queue = queue.slice(1);
    cardSelected = false;
    if (!standalone) quiz.setAnswer(myIndex, new Map(placements));
  }

  function returnCard(itemIdx) {
    if (isDisabled) return;
    placements.delete(itemIdx);
    queue = [itemIdx, ...queue];
    if (!standalone) quiz.setAnswer(myIndex, new Map(placements));
  }

  // --- Drag handlers ---

  function onDragStart(e) {
    isDragging = true;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    isDragging = false;
    dragOver = null;
  }

  function onDragOver(e, targetIdx) {
    if (isDisabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOver = targetIdx;
  }

  function onDragLeave(e) {
    // Only clear when leaving the target element itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
      dragOver = null;
    }
  }

  function onDrop(e, targetIdx) {
    e.preventDefault();
    isDragging = false;
    dragOver = null;
    placeCard(targetIdx);
  }

  // --- Click / tap handlers ---

  function onCardClick() {
    if (isDisabled || currentItemIdx === null) return;
    cardSelected = !cardSelected;
  }

  function onCardKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick();
    }
  }

  function onTargetClick(targetIdx) {
    if (isDisabled || !cardSelected) return;
    placeCard(targetIdx);
  }

  function onTargetKeydown(e, targetIdx) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTargetClick(targetIdx);
    }
  }

</script>

{#snippet sortingContent()}
  <p class="tessera-sorting-question">{question}</p>

  <!-- Card deck: shows the current card to be placed -->
  {#if !isDisabled}
    <div class="tessera-sorting-deck" aria-live="polite" aria-atomic="false">
      {#if currentItemIdx !== null}
        <div class="tessera-sorting-deck-inner">
          <div
            class="tessera-sorting-card"
            class:selected={cardSelected}
            class:dragging={isDragging}
            draggable={true}
            role="button"
            tabindex="0"
            aria-label="{cardSelected
              ? 'Selected — click a target to place: '
              : 'Drag or click to sort: '}{items[currentItemIdx]}"
            aria-grabbed={isDragging}
            ondragstart={onDragStart}
            ondragend={onDragEnd}
            onclick={onCardClick}
            onkeydown={onCardKeydown}
          >
            {items[currentItemIdx]}
          </div>
          <p class="tessera-sorting-counter">
            {queue.length} of {items.length} to sort
          </p>
          {#if cardSelected}
            <p class="tessera-sorting-hint">Click a target below to place this card</p>
          {/if}
        </div>
      {:else}
        <div class="tessera-sorting-deck-empty">
          All cards placed — check your answers below.
        </div>
      {/if}
    </div>
  {/if}

  <!-- Drop targets -->
  <div class="tessera-sorting-targets" class:targets-active={cardSelected && !isDisabled}>
    {#each targets as targetLabel, targetIdx}
      {@const targetItems = getItemsForTarget(targetIdx)}
      <div
        class="tessera-sorting-target"
        class:drag-over={dragOver === targetIdx}
        class:clickable={cardSelected && !isDisabled}
        role="button"
        tabindex="0"
        aria-disabled={!(cardSelected && !isDisabled)}
        aria-label="Target: {targetLabel}{cardSelected && !isDisabled ? ` (activate to place ${items[currentItemIdx]})` : ''}"
        ondragover={(e) => onDragOver(e, targetIdx)}
        ondragleave={onDragLeave}
        ondrop={(e) => onDrop(e, targetIdx)}
        onclick={() => onTargetClick(targetIdx)}
        onkeydown={(e) => onTargetKeydown(e, targetIdx)}
      >
        <div class="tessera-sorting-target-label">{targetLabel}</div>
        {#if targetItems.length > 0}
          <div class="tessera-sorting-target-items">
            {#each targetItems as itemIdx}
              <div
                class="tessera-sorting-placed-item"
                class:correct={showFeedback && isCorrectPlacement(itemIdx)}
                class:incorrect={showFeedback && !isCorrectPlacement(itemIdx)}
              >
                <span class="tessera-sorting-item-text">{items[itemIdx]}</span>
                {#if !isDisabled}
                  <button
                    class="tessera-sorting-remove"
                    aria-label="Return '{items[itemIdx]}' to deck"
                    onclick={(e) => { e.stopPropagation(); returnCard(itemIdx); }}
                  >×</button>
                {:else if showFeedback}
                  <span class="tessera-sorting-item-icon" aria-hidden="true">
                    {isCorrectPlacement(itemIdx) ? '✓' : '✗'}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Feedback (shown after standalone submit or quiz feedbackVisible) -->
  {#if showFeedback}
    {@const isCorrect = checkAnswer(placements)}
    <div class="tessera-sorting-review">
      {#if isCorrect}
        <div class="tessera-sorting-result correct">
          <ResultIcon kind="correct" />
          All items sorted correctly!
        </div>
        {#if correctFeedback}
          <p class="tessera-sorting-feedback correct">{correctFeedback}</p>
        {/if}
      {:else}
        <div class="tessera-sorting-result incorrect">
          <ResultIcon kind="incorrect" />
          Some items are in the wrong category.
        </div>
        <div class="tessera-sorting-correct-list">
          <p class="tessera-sorting-correct-title">Correct arrangement:</p>
          {#each items as item, i}
            <p class="tessera-sorting-correct-item">{item} → {targets[correct[i]]}</p>
          {/each}
        </div>
        {#if incorrectFeedback}
          <p class="tessera-sorting-feedback incorrect">{incorrectFeedback}</p>
        {/if}
      {/if}
      {#if standalone && handle.canRetry}
        <RetryButton onclick={() => handle.retry()} />
      {/if}
    </div>
  {/if}

  <!-- Standalone Check button (shown once all cards are placed) -->
  {#if standalone && !handle.submitted && placements.size === items.length}
    <div class="tessera-sorting-actions">
      <button class="tessera-btn-primary tessera-sorting-check" onclick={() => handle.submit()}>
        Check Answer
      </button>
    </div>
  {/if}
{/snippet}

{#if standalone}
  <div class="tessera-sorting" aria-label={question}>
    {@render sortingContent()}
  </div>
{/if}

{#snippet renderQuestion()}
  <div class="tessera-sorting" aria-label={question}>
    {#if isLocked}
      <LockedBanner />
    {/if}
    {@render sortingContent()}
  </div>
{/snippet}

<style>
  .tessera-sorting {
    padding: var(--tessera-spacing-md) 0;
  }

  .tessera-sorting-question {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--tessera-spacing-lg);
    color: var(--tessera-text);
  }

  /* --- Deck --- */

  .tessera-sorting-deck {
    margin-bottom: var(--tessera-spacing-lg);
    min-height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tessera-sorting-deck-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--tessera-spacing-sm);
  }

  .tessera-sorting-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--tessera-spacing-md) var(--tessera-spacing-xl);
    min-width: 140px;
    min-height: 64px;
    background: var(--tessera-bg);
    border: 2px solid var(--tessera-border);
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    font-size: 1rem;
    font-weight: 500;
    font-family: var(--tessera-font-family);
    color: var(--tessera-text);
    cursor: grab;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    text-align: center;
    user-select: none;
  }

  .tessera-sorting-card:hover {
    border-color: var(--tessera-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }

  .tessera-sorting-card:focus-visible {
    outline: var(--tessera-focus-ring);
    outline-offset: 2px;
    border-color: var(--tessera-primary);
  }

  .tessera-sorting-card.selected {
    border-color: var(--tessera-primary);
    background: var(--tessera-primary-light);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px) scale(1.02);
    cursor: pointer;
  }

  .tessera-sorting-card.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .tessera-sorting-counter {
    font-size: 0.8125rem;
    color: var(--tessera-text-light);
    margin: 0;
  }

  .tessera-sorting-hint {
    font-size: 0.8125rem;
    color: var(--tessera-primary);
    font-weight: 500;
    margin: 0;
  }

  .tessera-sorting-deck-empty {
    font-size: 0.9375rem;
    color: var(--tessera-text-light);
    font-style: italic;
  }

  /* --- Targets --- */

  .tessera-sorting-targets {
    display: flex;
    gap: var(--tessera-spacing-md);
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .tessera-sorting-target {
    flex: 1;
    min-width: 140px;
    min-height: 120px;
    border: 2px dashed var(--tessera-border);
    border-radius: 10px;
    background: var(--tessera-bg-secondary);
    transition: border-color 0.15s, background 0.15s;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tessera-sorting-target.drag-over {
    border-color: var(--tessera-primary);
    background: var(--tessera-primary-light);
    border-style: solid;
  }

  .tessera-sorting-target.clickable {
    cursor: pointer;
    border-color: var(--tessera-primary);
    border-style: dashed;
  }

  .tessera-sorting-target.clickable:hover {
    background: var(--tessera-primary-light);
    border-style: solid;
  }

  .tessera-sorting-target-label {
    padding: var(--tessera-spacing-sm) var(--tessera-spacing-md);
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tessera-text-light);
    text-align: center;
    pointer-events: none;
  }

  .tessera-sorting-target-items {
    display: flex;
    flex-direction: column;
    gap: var(--tessera-spacing-xs, 4px);
    padding: var(--tessera-spacing-sm);
    pointer-events: none;
  }

  .tessera-sorting-placed-item {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-xs, 4px);
    padding: 6px var(--tessera-spacing-sm);
    background: var(--tessera-bg);
    border: 1px solid var(--tessera-border);
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: var(--tessera-font-family);
    color: var(--tessera-text);
    transition: border-color 0.15s, background 0.15s;
    pointer-events: all;
  }

  .tessera-sorting-placed-item.correct {
    border-color: var(--tessera-success);
    background: var(--tessera-success-bg);
  }

  .tessera-sorting-placed-item.incorrect {
    border-color: var(--tessera-error);
    background: var(--tessera-error-bg);
  }

  .tessera-sorting-item-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .tessera-sorting-item-icon {
    flex-shrink: 0;
    font-size: 0.875rem;
  }

  .tessera-sorting-placed-item.correct .tessera-sorting-item-icon {
    color: var(--tessera-success);
  }

  .tessera-sorting-placed-item.incorrect .tessera-sorting-item-icon {
    color: var(--tessera-error);
  }

  .tessera-sorting-remove {
    flex-shrink: 0;
    margin-left: auto;
    background: none;
    border: none;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--tessera-text-light);
    cursor: pointer;
    padding: 0 2px;
    min-width: 20px;
    min-height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    pointer-events: all;
  }

  .tessera-sorting-remove:hover {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 10%, transparent);
  }

  /* --- Feedback --- */

  .tessera-sorting-review {
    margin-top: var(--tessera-spacing-lg);
  }

  .tessera-sorting-result {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: var(--tessera-spacing-sm);
  }

  .tessera-sorting-result.correct { color: var(--tessera-success); }
  .tessera-sorting-result.incorrect { color: var(--tessera-error); }

  .tessera-sorting-correct-list {
    margin: var(--tessera-spacing-sm) 0;
    font-size: 0.875rem;
    color: var(--tessera-text-light);
  }

  .tessera-sorting-correct-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--tessera-text);
  }

  .tessera-sorting-correct-item {
    margin: 2px 0;
  }

  .tessera-sorting-feedback {
    font-size: 0.875rem;
    padding: var(--tessera-spacing-sm) var(--tessera-spacing-md);
    border-radius: 4px;
    margin-top: var(--tessera-spacing-sm);
  }

  .tessera-sorting-feedback.correct {
    color: var(--tessera-success);
    background: var(--tessera-success-bg);
  }

  .tessera-sorting-feedback.incorrect {
    color: var(--tessera-error);
    background: var(--tessera-error-bg);
  }

  /* --- Standalone actions --- */

  .tessera-sorting-actions {
    margin-top: var(--tessera-spacing-lg);
  }

  .tessera-sorting-check {
    padding: 0.625rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 500;
  }

  /* --- Mobile --- */

  @media (max-width: 640px) {
    .tessera-sorting-targets {
      flex-direction: column;
    }

    .tessera-sorting-target {
      min-width: unset;
      width: 100%;
    }

    .tessera-sorting-card {
      min-width: 140px;
      font-size: 0.9375rem;
    }
  }
</style>
