<script>
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { questionId, shuffle } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import ResultIcon from './ResultIcon.svelte';
  import RetryButton from './RetryButton.svelte';

  let {
    id,
    question,
    pairs,
    correctFeedback = '',
    incorrectFeedback = '',
    maxRetries = Infinity,
    weight = 1,
  } = $props();

  let shuffledRight = $state([]);
  const matches = new SvelteMap();
  // Reverse index (right.originalIndex → left index) for O(1) right-column lookups.
  const rightToLeft = new SvelteMap();
  let selectedLeft = $state(null);
  let selectedRight = $state(null);

  const pairColors = [
    '#2563eb',
    '#9333ea',
    '#0891b2',
    '#c2410c',
    '#4f46e5',
    '#0d9488',
    '#b91c1c',
    '#7c3aed',
    '#0369a1',
    '#a16207',
  ];

  function initShuffle() {
    shuffledRight = shuffle(
      pairs.map((p, i) => ({ text: p.right, originalIndex: i })),
    );
  }

  function checkAnswer(answer) {
    if (!answer || !(answer instanceof Map)) return false;
    if (answer.size !== pairs.length) return false;
    for (let i = 0; i < pairs.length; i++) {
      if (answer.get(i) !== i) return false;
    }
    return true;
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
      return questionId(id, 'matching', question);
    },
    get weight() {
      return weight;
    },
    get maxRetries() {
      return maxRetries;
    },
    response: () => ({
      type: 'matching',
      response: [...matches.entries()].map(([l, r]) => [String(l), String(r)]),
      correct: pairs.map((_, i) => [String(i), String(i)]),
    }),
    reset: resetState,
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

    if (inQuiz) {
      q.setAnswer(new Map(matches));
    } else if (matches.size === pairs.length && !q.submitted) {
      q.submit();
    }
  }

  function removeMatch(leftIndex) {
    if (q.locked) return;
    const right = matches.get(leftIndex);
    matches.delete(leftIndex);
    if (right !== undefined) rightToLeft.delete(right);
    if (inQuiz) q.setAnswer(new Map(matches));
  }

  function getMatchColor(leftIndex) {
    if (!matches.has(leftIndex)) return null;
    return pairColors[leftIndex % pairColors.length];
  }

  function getRightMatchColor(rightOriginalIndex) {
    const l = rightToLeft.get(rightOriginalIndex);
    return l === undefined ? null : pairColors[l % pairColors.length];
  }

  function isRightMatched(rightOriginalIndex) {
    return rightToLeft.has(rightOriginalIndex);
  }

  function getLeftForRight(rightOriginalIndex) {
    return rightToLeft.get(rightOriginalIndex);
  }

  function isMatchCorrect(leftIndex) {
    return matches.get(leftIndex) === leftIndex;
  }
</script>

<QuestionShell {q} class="tessera-matching" aria-label={question}>
  <p class="tessera-matching-question">{question}</p>

  <div class="tessera-matching-grid">
    <!-- Left column -->
    <div class="tessera-matching-column">
      <div class="tessera-matching-column-header">Match from</div>
      {#each pairs as pair, i (i)}
        {@const color = getMatchColor(i)}
        {@const isSelected = selectedLeft === i}
        {@const matched = matches.has(i)}
        {@const correctMatch =
          q.feedbackVisible && matched && isMatchCorrect(i)}
        {@const wrongMatch = q.feedbackVisible && matched && !isMatchCorrect(i)}
        <button
          class="tessera-matching-item left"
          class:selected={isSelected}
          class:matched
          class:correct={correctMatch}
          class:incorrect={wrongMatch}
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() =>
            matched && !q.locked ? removeMatch(i) : handleLeftClick(i)}
          disabled={q.locked}
          aria-label="{pair.left}{matched
            ? ' (matched, activate to unmatch)'
            : ''}"
        >
          {#if matched}
            <span class="tessera-matching-badge" style="background: {color}">
              {i + 1}
            </span>
          {/if}
          <span>{pair.left}</span>
          {#if matched && !q.locked}
            <span class="tessera-matching-unmatch" aria-hidden="true">×</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Right column -->
    <div class="tessera-matching-column">
      <div class="tessera-matching-column-header">Match to</div>
      {#each shuffledRight as item (item.originalIndex)}
        {@const color = getRightMatchColor(item.originalIndex)}
        {@const isSelected = selectedRight === item.originalIndex}
        {@const matched = isRightMatched(item.originalIndex)}
        <button
          class="tessera-matching-item right"
          class:selected={isSelected}
          class:matched
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() => handleRightClick(item.originalIndex)}
          disabled={q.locked}
          aria-label="{item.text}{matched ? ' (matched)' : ''}"
        >
          {#if matched}
            {@const leftIdx = getLeftForRight(item.originalIndex)}
            <span class="tessera-matching-badge" style="background: {color}">
              {leftIdx !== undefined ? leftIdx + 1 : ''}
            </span>
          {/if}
          <span>{item.text}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if q.feedbackVisible}
    {@const isCorrect = checkAnswer(matches)}
    <div class="tessera-matching-review">
      {#if isCorrect}
        <div class="tessera-matching-result correct">
          <ResultIcon kind="correct" />
          All pairs matched correctly!
        </div>
        {#if correctFeedback}
          <p class="tessera-matching-feedback correct">{correctFeedback}</p>
        {/if}
      {:else}
        <div class="tessera-matching-result incorrect">
          <ResultIcon kind="incorrect" />
          Some pairs are incorrect
        </div>
        <div class="tessera-matching-correct-pairs">
          <p class="tessera-matching-correct-pairs-title">Correct pairs:</p>
          {#each pairs as pair, i (i)}
            <p class="tessera-matching-correct-pair">
              {pair.left} → {pair.right}
            </p>
          {/each}
        </div>
        {#if incorrectFeedback}
          <p class="tessera-matching-feedback incorrect">{incorrectFeedback}</p>
        {/if}
      {/if}
      {#if !inQuiz && q.canRetry}
        <RetryButton onclick={() => q.retry()} />
      {/if}
    </div>
  {/if}
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
    opacity: 0.9;
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

  .tessera-matching-review {
    margin-top: var(--tessera-spacing-lg);
  }

  .tessera-matching-result {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: var(--tessera-spacing-sm);
  }

  .tessera-matching-result.correct {
    color: var(--tessera-success);
  }

  .tessera-matching-result.incorrect {
    color: var(--tessera-error);
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

  .tessera-matching-feedback {
    font-size: 0.875rem;
    padding: var(--tessera-spacing-sm) var(--tessera-spacing-md);
    border-radius: 4px;
    margin-top: var(--tessera-spacing-sm);
  }

  .tessera-matching-feedback.correct {
    color: var(--tessera-success);
    background: var(--tessera-success-bg);
  }

  .tessera-matching-feedback.incorrect {
    color: var(--tessera-error);
    background: var(--tessera-error-bg);
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
