<script>
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import {
    QUESTION_ID_PREFIX,
    indexIds,
    questionId,
    savedIndex,
    shuffle,
  } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import QuestionReview from './QuestionReview.svelte';

  /**
   * @type {{
   *   id?: string;
   *   question: string;
   *   items: string[];
   *   targets: string[];
   *   correct: number[];
   *   correctFeedback?: string;
   *   incorrectFeedback?: string;
   *   graded?: boolean;
   *   maxRetries?: number;
   *   weight?: number;
   * }}
   */
  let {
    id,
    question,
    items,
    targets,
    correct,
    correctFeedback = '',
    incorrectFeedback = '',
    graded,
    maxRetries,
    weight = 1,
  } = $props();

  let queue = $state([]); // item indices not yet placed; queue[0] is current
  const placements = new SvelteMap(); // itemIdx → targetIdx
  let dragOver = $state(null); // target index highlighted during drag
  let isDragging = $state(false);
  let cardSelected = $state(false); // current card selected via tap/click
  let cardEl = $state(null);
  const componentId = $props.id();
  const hintId = `sorting-${componentId}-hint`;

  function initQueue() {
    queue = shuffle(items.map((_, i) => i).filter((i) => !placements.has(i)));
    cardSelected = false;
    dragOver = null;
    isDragging = false;
  }

  function resetState() {
    placements.clear();
    initQueue();
  }

  // Sorting is semantically a categorization (each item → one target) and maps
  // cleanly to SCORM 2004's `matching` interaction. We emit [itemIdx, targetIdx]
  // pairs as stringified ids.
  const q = useQuestion({
    get id() {
      return questionId(id, QUESTION_ID_PREFIX.Sorting, question);
    },
    graded: untrack(() => graded),
    weight: untrack(() => weight),
    maxRetries: untrack(() => maxRetries),
    complete: () => placements.size === items.length,
    response: () => {
      const itemIds = indexIds(items);
      return {
        type: 'matching',
        response: [...placements.entries()].map(([i, t]) => [
          String(i),
          String(t),
        ]),
        correct: itemIds.map((id, i) => [id, String(correct[i])]),
        optionPairs: { left: itemIds, right: indexIds(targets) },
      };
    },
    reset: resetState,
    restore: (response) => {
      const saved = response.map(([item, target]) => [
        savedIndex(item, items),
        savedIndex(target, targets),
      ]);
      for (const [item, target] of saved) placements.set(item, target);
      return new Map(placements);
    },
  });

  // `q.mode` is fixed for the lifetime of the widget; capture it once so
  // setup-time branches don't trip Svelte's "state_referenced_locally" warning.
  const inQuiz = q.mode === 'quiz';

  if (!inQuiz) {
    initQueue();
  } else {
    onMount(initQueue);
  }

  let currentItemIdx = $derived(queue.length > 0 ? queue[0] : null);

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
    if (q.locked || currentItemIdx === null) return;
    const itemIdx = queue[0];
    placements.set(itemIdx, targetIdx);
    queue = queue.slice(1);
    cardSelected = false;
    q.setAnswer(new Map(placements));
  }

  async function returnCard(itemIdx) {
    if (q.locked) return;
    placements.delete(itemIdx);
    queue = [itemIdx, ...queue];
    cardSelected = false;
    q.setAnswer(new Map(placements));
    // The clicked button unmounts; keep keyboard focus on the returned card.
    await tick();
    cardEl?.focus();
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
    if (q.locked) return;
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
    if (q.locked || currentItemIdx === null) return;
    cardSelected = !cardSelected;
  }

  function onCardKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick();
    }
  }
</script>

<QuestionShell {q} class="tessera-sorting" aria-label={question}>
  <p class="tessera-sorting-question">{question}</p>

  <!-- Card deck: shows the current card to be placed -->
  {#if !q.locked}
    <div class="tessera-sorting-deck" aria-live="polite" aria-atomic="false">
      {#if currentItemIdx !== null}
        <div class="tessera-sorting-deck-inner">
          <div
            bind:this={cardEl}
            class="tessera-sorting-card"
            class:selected={cardSelected}
            class:dragging={isDragging}
            draggable={true}
            role="button"
            tabindex="0"
            aria-pressed={cardSelected}
            aria-describedby={hintId}
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
            <p class="tessera-sorting-hint" aria-hidden="true">
              Click a target below to place this card
            </p>
          {/if}
        </div>
      {:else}
        <div class="tessera-sorting-deck-empty">
          All cards placed.{#if !inQuiz}
            Submit your answers below.{/if}
        </div>
      {/if}
    </div>
    <!-- A description, not part of the name: a toggle keeps its name when
         pressed. Hidden and outside the live deck so changes aren't announced. -->
    <span id={hintId} hidden
      >{cardSelected
        ? 'Choose a target.'
        : 'Activate, then choose a target.'}</span
    >
  {/if}

  <!-- Drop targets -->
  <div
    class="tessera-sorting-targets"
    class:targets-active={cardSelected && !q.locked}
    role="list"
  >
    {#each targets as targetLabel, targetIdx (targetIdx)}
      {@const targetItems = getItemsForTarget(targetIdx)}
      <div
        class="tessera-sorting-target"
        class:drag-over={dragOver === targetIdx}
        class:clickable={cardSelected && !q.locked}
        role="listitem"
        ondragover={(e) => onDragOver(e, targetIdx)}
        ondragleave={onDragLeave}
        ondrop={(e) => onDrop(e, targetIdx)}
      >
        <button
          type="button"
          class="tessera-sorting-target-label"
          disabled={q.locked}
          aria-disabled={!cardSelected}
          onclick={() => cardSelected && placeCard(targetIdx)}
        >
          {targetLabel}
          {#if cardSelected && !q.locked}
            <span class="tessera-sr-only"
              >(activate to place {items[currentItemIdx]})</span
            >
          {/if}
        </button>
        {#if targetItems.length > 0}
          <div class="tessera-sorting-target-items">
            {#each targetItems as itemIdx (itemIdx)}
              {@const ok = isCorrectPlacement(itemIdx)}
              <div
                class="tessera-sorting-placed-item"
                class:correct={q.feedbackVisible && ok}
                class:incorrect={q.feedbackVisible && !ok}
              >
                <span class="tessera-sorting-item-text">{items[itemIdx]}</span>
                {#if !q.locked}
                  <button
                    type="button"
                    class="tessera-sorting-remove"
                    aria-label="Return '{items[itemIdx]}' to deck"
                    onclick={() => returnCard(itemIdx)}>×</button
                  >
                {:else if q.feedbackVisible}
                  <span class="tessera-sorting-item-icon" aria-hidden="true">
                    {ok ? '✓' : '✗'}
                  </span>
                  <span class="tessera-sr-only"
                    >({ok ? 'correct' : 'incorrect'})</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Feedback (shown after standalone submit or quiz feedbackVisible) -->
  <QuestionReview
    {q}
    class="tessera-sorting-review"
    correctLabel="All items sorted correctly!"
    incorrectLabel="Some items are in the wrong category."
    {correctFeedback}
    {incorrectFeedback}
    firstControl={() => cardEl}
  >
    {#if !q.correct}
      <div class="tessera-sorting-correct-list">
        <p class="tessera-sorting-correct-title">Correct arrangement:</p>
        {#each items as item, i (i)}
          <p class="tessera-sorting-correct-item">
            {item} → {targets[correct[i]]}
          </p>
        {/each}
      </div>
    {/if}
  </QuestionReview>

  {#if !inQuiz && !q.submitted && q.answerComplete}
    <button
      type="button"
      class="tessera-btn-primary tessera-question-submit"
      onclick={q.submit}
    >
      Submit
    </button>
  {/if}
</QuestionShell>

<style>
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
    transition:
      border-color 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
    text-align: center;
    user-select: none;
  }

  .tessera-sorting-card:hover {
    border-color: var(--tessera-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }

  .tessera-sorting-card:focus-visible {
    outline: none;
    box-shadow: var(--tessera-focus-ring);
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
    transition:
      border-color 0.15s,
      background 0.15s;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
  }

  .tessera-sorting-target:has(.tessera-sorting-target-label:focus-visible) {
    box-shadow: var(--tessera-focus-ring);
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
    background: none;
    border: none;
    box-shadow: none;
    cursor: inherit;
    padding: var(--tessera-spacing-sm) var(--tessera-spacing-md);
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tessera-text-light);
    text-align: center;
  }

  /* Stretch the button over the whole target so a click anywhere places the card. */
  .tessera-sorting-target.clickable .tessera-sorting-target-label::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .tessera-sorting-target-items {
    display: flex;
    flex-direction: column;
    gap: var(--tessera-spacing-xs, 4px);
    padding: var(--tessera-spacing-sm);
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
    transition:
      border-color 0.15s,
      background 0.15s;
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
    /* Lifts the button above the target's stretched click area. */
    position: relative;
  }

  .tessera-sorting-remove:hover {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 10%, transparent);
  }

  /* --- Feedback --- */

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
