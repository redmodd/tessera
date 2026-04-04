<script>
  import { getContext, onMount } from 'svelte';

  let {
    question,
    pairs,
    correctFeedback = '',
    incorrectFeedback = '',
  } = $props();

  const quiz = getContext('tessera-quiz');

  let myIndex = $state(-1);
  // Shuffled right-side items
  let shuffledRight = $state([]);
  // Current matches: Map<leftIndex, rightIndex>
  let matches = $state(new Map());
  // Currently selected left item (tap-to-select)
  let selectedLeft = $state(null);
  // Currently selected right item (tap-to-select)
  let selectedRight = $state(null);

  // Color palette for matched pairs
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

  onMount(() => {
    // Create shuffled right column with original indices
    shuffledRight = shuffleArray(pairs.map((p, i) => ({ text: p.right, originalIndex: i })));

    myIndex = quiz.registerQuestion({
      checkAnswer,
      reset: resetState,
      render: renderQuestion,
    });
  });

  function checkAnswer(answer) {
    if (!answer || !(answer instanceof Map)) return false;
    if (answer.size !== pairs.length) return false;
    // Every left index must be matched to its correct right index
    for (let i = 0; i < pairs.length; i++) {
      if (answer.get(i) !== i) return false;
    }
    return true;
  }

  function resetState() {
    matches = new Map();
    selectedLeft = null;
    selectedRight = null;
    shuffledRight = shuffleArray(pairs.map((p, i) => ({ text: p.right, originalIndex: i })));
  }

  let isLocked = $derived(quiz.isLockedCorrect(myIndex));

  function handleLeftClick(leftIndex) {
    if (quiz.submitted || isLocked) return;

    if (selectedLeft === leftIndex) {
      // Deselect
      selectedLeft = null;
      return;
    }

    selectedLeft = leftIndex;

    // If a right item is already selected, create the match
    if (selectedRight !== null) {
      createMatch(leftIndex, selectedRight);
    }
  }

  function handleRightClick(rightOriginalIndex) {
    if (quiz.submitted || isLocked) return;

    if (selectedRight === rightOriginalIndex) {
      selectedRight = null;
      return;
    }

    selectedRight = rightOriginalIndex;

    // If a left item is already selected, create the match
    if (selectedLeft !== null) {
      createMatch(selectedLeft, selectedRight);
    }
  }

  function createMatch(leftIndex, rightOriginalIndex) {
    const newMatches = new Map(matches);

    // Remove any existing match involving this left or right item
    for (const [l, r] of newMatches) {
      if (l === leftIndex || r === rightOriginalIndex) {
        newMatches.delete(l);
      }
    }

    newMatches.set(leftIndex, rightOriginalIndex);
    matches = newMatches;
    selectedLeft = null;
    selectedRight = null;

    // Report answer to quiz
    quiz.setAnswer(myIndex, new Map(matches));
  }

  function removeMatch(leftIndex) {
    if (quiz.submitted || isLocked) return;
    const newMatches = new Map(matches);
    newMatches.delete(leftIndex);
    matches = newMatches;
    quiz.setAnswer(myIndex, new Map(matches));
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
</script>

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
    <p class="tessera-matching-question">{question}</p>

    <div class="tessera-matching-grid">
      <!-- Left column -->
      <div class="tessera-matching-column">
        <div class="tessera-matching-column-header">Match from</div>
        {#each pairs as pair, i}
          {@const color = getMatchColor(i)}
          {@const isSelected = selectedLeft === i}
          {@const matched = matches.has(i)}
          {@const correct = quiz.feedbackVisible(myIndex) && matched && isMatchCorrect(i)}
          {@const wrong = quiz.feedbackVisible(myIndex) && matched && !isMatchCorrect(i)}
          <button
            class="tessera-matching-item left"
            class:selected={isSelected}
            class:matched
            class:correct
            class:incorrect={wrong}
            style={color ? `border-color: ${color}; --match-color: ${color}` : ''}
            onclick={() => matched && !quiz.submitted ? removeMatch(i) : handleLeftClick(i)}
            disabled={quiz.submitted || isLocked}
            aria-label="{pair.left}{matched ? ' (matched)' : ''}"
          >
            {#if matched}
              <span class="tessera-matching-badge" style="background: {color}">
                {i + 1}
              </span>
            {/if}
            <span>{pair.left}</span>
            {#if matched && !quiz.submitted && !isLocked}
              <span
                class="tessera-matching-unmatch"
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); removeMatch(i); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); removeMatch(i); } }}
                aria-label="Remove match for {pair.left}"
              >×</span>
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
            disabled={quiz.submitted || isLocked}
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

    {#if quiz.feedbackVisible(myIndex)}
      {@const answer = quiz.getAnswer(myIndex)}
      {@const isCorrect = checkAnswer(answer)}
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
      </div>
    {/if}
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
