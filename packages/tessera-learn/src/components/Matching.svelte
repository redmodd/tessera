<script>
  import { getContext, onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { slugFromQuestion } from './util.js';

  let {
    id,
    question,
    pairs,
    correctFeedback = '',
    incorrectFeedback = '',
    maxRetries = Infinity,
    weight = 1,
  } = $props();

  const quiz = getContext('tessera-quiz');
  const standalone = !quiz;

  let shuffledRight = $state([]);
  let matches = $state(new SvelteMap());
  let selectedLeft = $state(null);
  let selectedRight = $state(null);

  let saRetryCount = $state(0);
  let saCanRetry = $derived(saRetryCount < maxRetries);
  let saAllMatched = $derived(matches.size === pairs.length);

  const defaultId = `matching-${slugFromQuestion(question)}`;

  const pairColors = [
    '#2563eb', '#9333ea', '#0891b2', '#c2410c', '#4f46e5',
    '#0d9488', '#b91c1c', '#7c3aed', '#0369a1', '#a16207',
  ];

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function initShuffle() {
    shuffledRight = shuffleArray(pairs.map((p, i) => ({ text: p.right, originalIndex: i })));
  }

  if (standalone) {
    initShuffle();
  } else {
    onMount(() => {
      initShuffle();
      quiz.setRender(myIndex, renderQuestion);
    });
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
    matches = new SvelteMap();
    selectedLeft = null;
    selectedRight = null;
    initShuffle();
  }

  const handle = useQuestion({
    id: id ?? defaultId,
    weight,
    response: () => ({
      type: 'matching',
      response: [...matches.entries()].map(([l, r]) => [String(l), String(r)]),
      correct: pairs.map((_, i) => [String(i), String(i)]),
    }),
    reset: resetState,
  });

  const myIndex = $derived(handle.quizIndex ?? -1);

  let isLocked = $derived(standalone ? false : quiz.isLockedCorrect(myIndex));
  let quizLocked = $derived(standalone ? handle.submitted : quiz.isAnswerLocked(myIndex));

  // Auto-submit in standalone mode when all pairs matched
  $effect(() => {
    if (standalone && saAllMatched && !handle.submitted) {
      handle.submit();
    }
  });

  function handleLeftClick(leftIndex) {
    if (standalone) {
      if (handle.submitted) return;
    } else {
      if (quizLocked) return;
    }

    if (selectedLeft === leftIndex) {
      selectedLeft = null;
      return;
    }

    selectedLeft = leftIndex;

    if (selectedRight !== null) {
      createMatch(leftIndex, selectedRight);
    }
  }

  function handleRightClick(rightOriginalIndex) {
    if (standalone) {
      if (handle.submitted) return;
    } else {
      if (quizLocked) return;
    }

    if (selectedRight === rightOriginalIndex) {
      selectedRight = null;
      return;
    }

    selectedRight = rightOriginalIndex;

    if (selectedLeft !== null) {
      createMatch(selectedLeft, selectedRight);
    }
  }

  function createMatch(leftIndex, rightOriginalIndex) {
    for (const [l, r] of matches) {
      if (l === leftIndex || r === rightOriginalIndex) {
        matches.delete(l);
      }
    }

    matches.set(leftIndex, rightOriginalIndex);
    selectedLeft = null;
    selectedRight = null;

    if (!standalone) {
      quiz.setAnswer(myIndex, new Map(matches));
    }
  }

  function removeMatch(leftIndex) {
    if (standalone) {
      if (handle.submitted) return;
    } else {
      if (quizLocked) return;
    }
    matches.delete(leftIndex);
    if (!standalone) {
      quiz.setAnswer(myIndex, new Map(matches));
    }
  }

  function handleRetry() {
    saRetryCount++;
    handle.reset();
  }

  function getMatchColor(leftIndex) {
    if (!matches.has(leftIndex)) return null;
    return pairColors[leftIndex % pairColors.length];
  }

  function getRightMatchColor(rightOriginalIndex) {
    for (const [l, r] of matches) {
      if (r === rightOriginalIndex) return pairColors[l % pairColors.length];
    }
    return null;
  }

  function isRightMatched(rightOriginalIndex) {
    for (const [, r] of matches) {
      if (r === rightOriginalIndex) return true;
    }
    return false;
  }

  function isMatchCorrect(leftIndex) {
    return matches.get(leftIndex) === leftIndex;
  }

  let showFeedback = $derived(standalone ? handle.submitted : quiz.feedbackVisible(myIndex));
  let isDisabled = $derived(standalone ? handle.submitted : quizLocked);
</script>

{#snippet matchingContent()}
  <p class="tessera-matching-question">{question}</p>

  <div class="tessera-matching-grid">
    <!-- Left column -->
    <div class="tessera-matching-column">
      <div class="tessera-matching-column-header">Match from</div>
      {#each pairs as pair, i}
        {@const color = getMatchColor(i)}
        {@const isSelected = selectedLeft === i}
        {@const matched = matches.has(i)}
        {@const correctMatch = showFeedback && matched && isMatchCorrect(i)}
        {@const wrongMatch = showFeedback && matched && !isMatchCorrect(i)}
        <button
          class="tessera-matching-item left"
          class:selected={isSelected}
          class:matched
          class:correct={correctMatch}
          class:incorrect={wrongMatch}
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() => matched && !isDisabled ? removeMatch(i) : handleLeftClick(i)}
          disabled={isDisabled}
          aria-label="{pair.left}{matched ? ' (matched, activate to unmatch)' : ''}"
        >
          {#if matched}
            <span class="tessera-matching-badge" style="background: {color}">
              {i + 1}
            </span>
          {/if}
          <span>{pair.left}</span>
          {#if matched && !isDisabled}
            <span class="tessera-matching-unmatch" aria-hidden="true">×</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Right column -->
    <div class="tessera-matching-column">
      <div class="tessera-matching-column-header">Match to</div>
      {#each shuffledRight as item}
        {@const color = getRightMatchColor(item.originalIndex)}
        {@const isSelected = selectedRight === item.originalIndex}
        {@const matched = isRightMatched(item.originalIndex)}
        <button
          class="tessera-matching-item right"
          class:selected={isSelected}
          class:matched
          style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
          onclick={() => handleRightClick(item.originalIndex)}
          disabled={isDisabled}
          aria-label="{item.text}{matched ? ' (matched)' : ''}"
        >
          {#if matched}
            {@const leftIdx = [...matches.entries()].find(([, r]) => r === item.originalIndex)?.[0]}
            <span class="tessera-matching-badge" style="background: {color}">
              {leftIdx !== undefined ? leftIdx + 1 : ''}
            </span>
          {/if}
          <span>{item.text}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if showFeedback}
    {@const isCorrect = checkAnswer(matches)}
    <div class="tessera-matching-review">
      {#if isCorrect}
        <div class="tessera-matching-result correct">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
          All pairs matched correctly!
        </div>
        {#if correctFeedback}
          <p class="tessera-matching-feedback correct">{correctFeedback}</p>
        {/if}
      {:else}
        <div class="tessera-matching-result incorrect">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
          Some pairs are incorrect
        </div>
        <div class="tessera-matching-correct-pairs">
          <p class="tessera-matching-correct-pairs-title">Correct pairs:</p>
          {#each pairs as pair}
            <p class="tessera-matching-correct-pair">{pair.left} → {pair.right}</p>
          {/each}
        </div>
        {#if incorrectFeedback}
          <p class="tessera-matching-feedback incorrect">{incorrectFeedback}</p>
        {/if}
      {/if}
      {#if standalone && saCanRetry}
        <button class="tessera-standalone-retry" onclick={handleRetry}>Try again</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#if standalone}
  <div class="tessera-matching" aria-label={question}>
    {@render matchingContent()}
  </div>
{/if}

{#snippet renderQuestion()}
  <div class="tessera-matching" aria-label={question}>
    {#if isLocked}
      <div class="tessera-quiz-locked-banner">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        You already got this one right — click Next to continue.
      </div>
    {/if}
    {@render matchingContent()}
  </div>
{/snippet}

<style>
  .tessera-matching {
    padding: var(--tessera-spacing-md) 0;
  }

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
    transition: border-color 0.2s, background 0.2s, transform 0.1s;
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
    background: color-mix(in srgb, var(--match-color, var(--tessera-primary)) 8%, transparent);
  }

  .tessera-matching-item.correct {
    border-color: var(--tessera-success) !important;
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent) !important;
  }

  .tessera-matching-item.incorrect {
    border-color: var(--tessera-error) !important;
    background: color-mix(in srgb, var(--tessera-error) 8%, transparent) !important;
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
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
  }

  .tessera-matching-feedback.incorrect {
    color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 8%, transparent);
  }

  .tessera-standalone-retry {
    display: inline-block;
    margin-top: var(--tessera-spacing-md);
    padding: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--tessera-primary);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .tessera-standalone-retry:hover {
    color: var(--tessera-primary-dark);
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
