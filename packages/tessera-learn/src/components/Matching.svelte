<script>
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import {
    MATCH_PAIR_COLORS,
    QUESTION_ID_PREFIX,
    indexIds,
    questionId,
    rovingIndex,
    savedIndex,
    shuffle,
  } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import QuestionReview from './QuestionReview.svelte';

  /**
   * @type {{
   *   id?: string;
   *   question: string;
   *   pairs: { left: string; right: string }[];
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
    pairs,
    correctFeedback = '',
    incorrectFeedback = '',
    graded,
    maxRetries,
    weight = 1,
  } = $props();

  let shuffledRight = $state([]);
  const matches = new SvelteMap();
  // Reverse index (right.originalIndex → left index) for O(1) right-column lookups.
  const rightToLeft = new SvelteMap();
  let selectedLeft = $state(null);
  let selectedRight = $state(null);
  let leftFocus = $state(0);
  let rightFocus = $state(0);
  let leftColumn;
  const componentId = $props.id();
  const leftHeadingId = `matching-${componentId}-from`;
  const rightHeadingId = `matching-${componentId}-to`;
  const hintId = `matching-${componentId}-hint`;
  const startHintId = `matching-${componentId}-start-hint`;

  function initShuffle() {
    shuffledRight = shuffle(
      pairs.map((p, i) => ({ text: p.right, originalIndex: i })),
    );
  }

  function resetState() {
    matches.clear();
    rightToLeft.clear();
    selectedLeft = null;
    selectedRight = null;
    initShuffle();
  }

  const q = useQuestion({
    get id() {
      return questionId(id, QUESTION_ID_PREFIX.Matching, question);
    },
    graded: untrack(() => graded),
    weight: untrack(() => weight),
    maxRetries: untrack(() => maxRetries),
    complete: () => matches.size === pairs.length,
    response: () => {
      const ids = indexIds(pairs);
      return {
        type: 'matching',
        response: [...matches.entries()].map(([l, r]) => [
          String(l),
          String(r),
        ]),
        correct: ids.map((id) => [id, id]),
        optionPairs: { left: ids, right: ids },
      };
    },
    reset: resetState,
    restore: (response) => {
      const saved = response.map((pair) =>
        pair.map((index) => savedIndex(index, pairs)),
      );
      for (const [left, right] of saved) {
        matches.set(left, right);
        rightToLeft.set(right, left);
      }
      return new Map(matches);
    },
  });

  // `q.mode` is fixed for the lifetime of the widget; capture it once so
  // setup-time branches don't trip Svelte's "state_referenced_locally" warning.
  const inQuiz = q.mode === 'quiz';

  if (!inQuiz) {
    initShuffle();
  } else {
    onMount(initShuffle);
  }

  function handleLeftClick(leftIndex) {
    if (q.locked) return;
    if (selectedLeft === leftIndex) {
      selectedLeft = null;
      return;
    }
    selectedLeft = leftIndex;
    if (selectedRight !== null) createMatch(leftIndex, selectedRight);
  }

  function handleRightClick(rightOriginalIndex) {
    if (q.locked) return;
    if (selectedRight === rightOriginalIndex) {
      selectedRight = null;
      return;
    }
    selectedRight = rightOriginalIndex;
    if (selectedLeft !== null) createMatch(selectedLeft, selectedRight);
  }

  function createMatch(leftIndex, rightOriginalIndex) {
    // Free any prior partner on either side so both maps stay consistent.
    const priorRightForLeft = matches.get(leftIndex);
    if (priorRightForLeft !== undefined) {
      rightToLeft.delete(priorRightForLeft);
    }
    const priorLeftForRight = rightToLeft.get(rightOriginalIndex);
    if (priorLeftForRight !== undefined) {
      matches.delete(priorLeftForRight);
    }

    matches.set(leftIndex, rightOriginalIndex);
    rightToLeft.set(rightOriginalIndex, leftIndex);
    selectedLeft = null;
    selectedRight = null;

    q.setAnswer(new Map(matches));
  }

  function removeMatch(leftIndex) {
    if (q.locked) return;
    const right = matches.get(leftIndex);
    matches.delete(leftIndex);
    if (right !== undefined) rightToLeft.delete(right);
    q.setAnswer(new Map(matches));
  }

  function getMatchColor(leftIndex) {
    if (!matches.has(leftIndex)) return null;
    return MATCH_PAIR_COLORS[leftIndex % MATCH_PAIR_COLORS.length];
  }

  function isMatchCorrect(leftIndex) {
    return matches.get(leftIndex) === leftIndex;
  }

  function srDetail(parts) {
    const text = parts.filter(Boolean).join(', ');
    return text && `(${text})`;
  }

  function resultText(leftIndex) {
    if (!q.feedbackVisible) return '';
    return isMatchCorrect(leftIndex) ? 'correct' : 'incorrect';
  }

  // Roving tabindex: each column is one Tab stop, arrows move within it.
  const NEXT = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

  function onItemKeydown(e) {
    const items = [...e.currentTarget.parentElement.querySelectorAll('button')];
    const next = rovingIndex(
      e,
      items.indexOf(e.currentTarget),
      items.length,
      NEXT,
    );
    if (next === undefined) return;
    e.preventDefault();
    items[next].focus();
  }
</script>

<QuestionShell {q} class="tessera-matching" aria-label={question}>
  <p class="tessera-matching-question">{question}</p>

  <div class="tessera-matching-grid">
    <!-- Left column -->
    <div
      bind:this={leftColumn}
      class="tessera-matching-column"
      role="group"
      aria-labelledby={leftHeadingId}
    >
      <div id={leftHeadingId} class="tessera-matching-column-header">
        Match from
      </div>
      {#each pairs as pair, i (i)}
        {@const color = getMatchColor(i)}
        {@const isSelected = selectedLeft === i}
        {@const matched = matches.has(i)}
        {@const result = matched ? resultText(i) : ''}
        {@const detail = srDetail([
          matched && `matched with ${pairs[matches.get(i)].right}`,
          matched && (q.locked ? result : 'activate to unmatch'),
          !matched &&
            selectedRight !== null &&
            !q.locked &&
            `activate to match with ${pairs[selectedRight].right}`,
        ])}
        {@const hint = q.locked
          ? undefined
          : isSelected
            ? hintId
            : !matched && selectedRight === null
              ? startHintId
              : undefined}
        <button
          type="button"
          class="tessera-matching-item left"
          class:selected={isSelected}
          class:matched
          class:correct={result === 'correct'}
          class:incorrect={result === 'incorrect'}
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() =>
            matched && !q.locked ? removeMatch(i) : handleLeftClick(i)}
          onfocus={() => (leftFocus = i)}
          onkeydown={onItemKeydown}
          tabindex={leftFocus === i ? 0 : -1}
          disabled={q.locked}
          aria-pressed={matched ? undefined : isSelected}
          aria-describedby={hint}
        >
          {#if matched}
            <span class="tessera-matching-badge" style="background: {color}">
              {i + 1}
            </span>
          {/if}
          <span>{pair.left}</span>
          {#if detail}
            <span class="tessera-sr-only">{detail}</span>
          {/if}
          {#if matched && !q.locked}
            <span class="tessera-matching-unmatch" aria-hidden="true">×</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Right column -->
    <div
      class="tessera-matching-column"
      role="group"
      aria-labelledby={rightHeadingId}
    >
      <div id={rightHeadingId} class="tessera-matching-column-header">
        Match to
      </div>
      {#each shuffledRight as item, pos (item.originalIndex)}
        {@const leftIdx = rightToLeft.get(item.originalIndex)}
        {@const matched = leftIdx !== undefined}
        {@const color = getMatchColor(leftIdx)}
        {@const isSelected = selectedRight === item.originalIndex}
        {@const detail = srDetail([
          matched && `matched with ${pairs[leftIdx].left}`,
          matched && resultText(leftIdx),
          selectedLeft !== null &&
            !q.locked &&
            `activate to match with ${pairs[selectedLeft].left}`,
        ])}
        {@const hint = q.locked
          ? undefined
          : isSelected
            ? hintId
            : selectedLeft === null
              ? startHintId
              : undefined}
        <button
          type="button"
          class="tessera-matching-item right"
          class:selected={isSelected}
          class:matched
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() => handleRightClick(item.originalIndex)}
          onfocus={() => (rightFocus = pos)}
          onkeydown={onItemKeydown}
          tabindex={rightFocus === pos ? 0 : -1}
          disabled={q.locked}
          aria-pressed={isSelected}
          aria-describedby={hint}
        >
          {#if matched}
            <span class="tessera-matching-badge" style="background: {color}">
              {leftIdx + 1}
            </span>
          {/if}
          <span>{item.text}</span>
          {#if detail}
            <span class="tessera-sr-only">{detail}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- A description, not part of the name: a toggle keeps its name when
       pressed. -->
  <span id={hintId} hidden>Choose a match.</span>
  <span id={startHintId} hidden>Activate, then choose a match.</span>
  <p class="tessera-sr-only" aria-live="polite">
    {matches.size === pairs.length && !q.locked
      ? inQuiz
        ? 'All pairs matched.'
        : 'All pairs matched. Submit your answer below.'
      : ''}
  </p>

  <QuestionReview
    {q}
    correctLabel="All pairs matched correctly!"
    incorrectLabel="Some pairs are incorrect"
    {correctFeedback}
    {incorrectFeedback}
    firstControl={() => leftColumn?.querySelector('button')}
  >
    {#if !q.correct}
      <div class="tessera-matching-correct-pairs">
        <p class="tessera-matching-correct-pairs-title">Correct pairs:</p>
        {#each pairs as pair, i (i)}
          <p class="tessera-matching-correct-pair">
            {pair.left} → {pair.right}
          </p>
        {/each}
      </div>
    {/if}
  </QuestionReview>
</QuestionShell>

<style>
  .tessera-matching-question {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--tessera-spacing-lg);
    color: var(--tessera-text);
  }

  .tessera-matching-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--tessera-spacing-lg);
  }

  .tessera-matching-column {
    display: flex;
    flex-direction: column;
    gap: var(--tessera-spacing-sm);
  }

  .tessera-matching-column-header {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tessera-text-light);
    padding-bottom: var(--tessera-spacing-sm);
    border-bottom: 1px solid var(--tessera-border);
  }

  .tessera-matching-item {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    padding: var(--tessera-spacing-md);
    border: 2px solid var(--tessera-border);
    border-radius: 8px;
    background: var(--tessera-bg);
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s,
      transform 0.1s;
    font-size: 0.9375rem;
    font-family: var(--tessera-font-family);
    color: var(--tessera-text);
    text-align: left;
    min-height: 44px;
  }

  .tessera-matching-item:hover:not(:disabled) {
    border-color: var(--tessera-primary);
    background: var(--tessera-bg-secondary);
  }

  .tessera-matching-item.selected {
    border-color: var(--tessera-primary);
    background: var(--tessera-primary-light);
    transform: scale(1.02);
  }

  .tessera-matching-item.matched {
    background: color-mix(
      in srgb,
      var(--match-color, var(--tessera-primary)) 8%,
      transparent
    );
  }

  .tessera-matching-item.correct {
    border-color: var(--tessera-success) !important;
    background: var(--tessera-success-bg) !important;
  }

  .tessera-matching-item.incorrect {
    border-color: var(--tessera-error) !important;
    background: var(--tessera-error-bg) !important;
  }

  .tessera-matching-item:disabled {
    cursor: default;
  }

  .tessera-matching-badge {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tessera-matching-unmatch {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--tessera-text-light);
    cursor: pointer;
    padding: 0 4px;
    min-width: 24px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .tessera-matching-unmatch:hover {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 10%, transparent);
  }

  .tessera-matching-correct-pairs {
    margin: var(--tessera-spacing-sm) 0;
    font-size: 0.875rem;
    color: var(--tessera-text-light);
  }

  .tessera-matching-correct-pairs-title {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .tessera-matching-correct-pair {
    margin: 2px 0;
  }

  @media (max-width: 640px) {
    .tessera-matching-grid {
      grid-template-columns: 1fr;
      gap: var(--tessera-spacing-xl);
    }

    .tessera-matching-item {
      padding: var(--tessera-spacing-md);
    }
  }
</style>
