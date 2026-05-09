<script>
  import { getContext, onMount } from 'svelte';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import { slugFromQuestion } from './util.js';
  import LockedBanner from './LockedBanner.svelte';
  import RetryButton from './RetryButton.svelte';

  let {
    id,
    question,
    options,
    correct,
    correctFeedback = '',
    incorrectFeedback = '',
    optionFeedback = [],
    maxRetries = Infinity,
    weight = 1,
  } = $props();

  const quiz = getContext('tessera-quiz');
  const standalone = !quiz;

  let selectedOption = $state(null);

  const componentId = $props.id();
  const groupId = `mc-${componentId}`;

  const handle = useQuestion({
    get id() { return id ?? `mc-${slugFromQuestion(question)}`; },
    get weight() { return weight; },
    get maxRetries() { return maxRetries; },
    response: () => ({
      type: 'choice',
      response: selectedOption !== null ? [String(selectedOption)] : [],
      correct: [String(correct)],
    }),
    reset: () => { selectedOption = null; },
  });

  const myIndex = $derived(handle.quizIndex ?? -1);

  onMount(() => {
    if (!standalone) quiz.setRender(myIndex, renderQuestion);
  });

  function handleSelect(optIndex) {
    if (standalone) {
      if (handle.submitted) return;
      selectedOption = optIndex;
      handle.submit();
    } else {
      if (quizLocked) return;
      selectedOption = optIndex;
      quiz.setAnswer(myIndex, optIndex);
    }
  }

  function isCorrectOption(optIndex) {
    return optIndex === correct;
  }

  // Quiz-mode helpers
  function getOptionClass(optIndex) {
    if (standalone) {
      if (!handle.submitted) return '';
      if (isCorrectOption(optIndex)) return 'correct';
      if (optIndex === selectedOption && !isCorrectOption(optIndex)) return 'incorrect';
      return '';
    }
    if (!quiz.feedbackVisible(myIndex)) return '';
    const answer = quiz.getAnswer(myIndex);
    if (isCorrectOption(optIndex)) return 'correct';
    if (optIndex === answer && !isCorrectOption(optIndex)) return 'incorrect';
    return '';
  }

  let isLocked = $derived(standalone ? false : quiz.isLockedCorrect(myIndex));
  let quizLocked = $derived(standalone ? handle.submitted : quiz.isAnswerLocked(myIndex));
</script>

{#if standalone}
  <div class="tessera-mc" role="radiogroup" aria-labelledby="{groupId}-label">
    <p class="tessera-mc-question" id="{groupId}-label">{question}</p>

    <div class="tessera-mc-options">
      {#each options as option, i}
        {@const optionId = `${groupId}-opt-${i}`}
        {@const isSelected = selectedOption === i}
        {@const stateClass = getOptionClass(i)}
        <label
          class="tessera-mc-option {stateClass}"
          class:selected={isSelected}
          for={optionId}
        >
          <input
            type="radio"
            id={optionId}
            name={groupId}
            value={i}
            checked={isSelected}
            disabled={handle.submitted}
            onchange={() => handleSelect(i)}
          />
          <span class="tessera-mc-radio-custom"></span>
          <span class="tessera-mc-option-text">{option}</span>

          {#if handle.submitted}
            {#if stateClass === 'correct' && (correctFeedback || optionFeedback[i])}
              <span class="tessera-mc-feedback correct">{optionFeedback[i] || correctFeedback}</span>
            {:else if stateClass === 'incorrect' && (incorrectFeedback || optionFeedback[i])}
              <span class="tessera-mc-feedback incorrect">{optionFeedback[i] || incorrectFeedback}</span>
            {:else if optionFeedback[i]}
              <span class="tessera-mc-feedback">{optionFeedback[i]}</span>
            {/if}
          {/if}
        </label>
      {/each}
    </div>

    {#if handle.submitted}
      {#if selectedOption === correct && correctFeedback && !optionFeedback[selectedOption]}
        <div class="tessera-mc-overall-feedback correct">{correctFeedback}</div>
      {:else if selectedOption !== correct && incorrectFeedback && !optionFeedback[selectedOption]}
        <div class="tessera-mc-overall-feedback incorrect">{incorrectFeedback}</div>
      {/if}
      {#if handle.canRetry}
        <RetryButton onclick={() => handle.retry()} />
      {/if}
    {/if}
  </div>
{/if}

{#snippet renderQuestion()}
  <div class="tessera-mc" role="radiogroup" aria-labelledby="{groupId}-label">
    {#if isLocked}
      <LockedBanner />
    {/if}
    <p class="tessera-mc-question" id="{groupId}-label">{question}</p>

    <div class="tessera-mc-options">
      {#each options as option, i}
        {@const optionId = `${groupId}-opt-${i}`}
        {@const isSelected = (quizLocked ? quiz.getAnswer(myIndex) : selectedOption) === i}
        {@const stateClass = getOptionClass(i)}
        <label
          class="tessera-mc-option {stateClass}"
          class:selected={isSelected}
          for={optionId}
        >
          <input
            type="radio"
            id={optionId}
            name={groupId}
            value={i}
            checked={isSelected}
            disabled={quizLocked}
            onchange={() => handleSelect(i)}
          />
          <span class="tessera-mc-radio-custom"></span>
          <span class="tessera-mc-option-text">{option}</span>

          {#if quiz.feedbackVisible(myIndex)}
            {#if stateClass === 'correct' && (correctFeedback || optionFeedback[i])}
              <span class="tessera-mc-feedback correct">{optionFeedback[i] || correctFeedback}</span>
            {:else if stateClass === 'incorrect' && (incorrectFeedback || optionFeedback[i])}
              <span class="tessera-mc-feedback incorrect">{optionFeedback[i] || incorrectFeedback}</span>
            {:else if optionFeedback[i]}
              <span class="tessera-mc-feedback">{optionFeedback[i]}</span>
            {/if}
          {/if}
        </label>
      {/each}
    </div>

    {#if quiz.feedbackVisible(myIndex)}
      {@const answer = quiz.getAnswer(myIndex)}
      {#if answer === correct && correctFeedback && !optionFeedback[answer]}
        <div class="tessera-mc-overall-feedback correct">{correctFeedback}</div>
      {:else if answer !== correct && incorrectFeedback && !optionFeedback[answer]}
        <div class="tessera-mc-overall-feedback incorrect">{incorrectFeedback}</div>
      {/if}
    {/if}
  </div>
{/snippet}

<style>
  .tessera-mc {
    padding: var(--tessera-spacing-md) 0;
  }

  .tessera-mc-question {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--tessera-spacing-lg);
    color: var(--tessera-text);
  }

  .tessera-mc-options {
    display: flex;
    flex-direction: column;
    gap: var(--tessera-spacing-sm);
  }

  .tessera-mc-option {
    display: flex;
    align-items: flex-start;
    gap: var(--tessera-spacing-md);
    padding: var(--tessera-spacing-md);
    border: 2px solid var(--tessera-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    flex-wrap: wrap;
    min-height: 44px;
  }

  .tessera-mc-option:hover:not(:has(input:disabled)) {
    border-color: var(--tessera-primary);
    background: var(--tessera-bg-secondary);
  }

  .tessera-mc-option.selected {
    border-color: var(--tessera-primary);
    background: var(--tessera-primary-light);
  }

  .tessera-mc-option.correct {
    border-color: var(--tessera-success);
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
  }

  .tessera-mc-option.incorrect {
    border-color: var(--tessera-error);
    background: color-mix(in srgb, var(--tessera-error) 8%, transparent);
  }

  .tessera-mc-option input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .tessera-mc-radio-custom {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border: 2px solid var(--tessera-border);
    border-radius: 50%;
    margin-top: 2px;
    transition: border-color 0.2s, background 0.2s;
    position: relative;
  }

  .tessera-mc-option.selected .tessera-mc-radio-custom {
    border-color: var(--tessera-primary);
  }

  .tessera-mc-option.selected .tessera-mc-radio-custom::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--tessera-primary);
  }

  .tessera-mc-option.correct .tessera-mc-radio-custom {
    border-color: var(--tessera-success);
  }

  .tessera-mc-option.correct .tessera-mc-radio-custom::after {
    background: var(--tessera-success);
  }

  .tessera-mc-option.incorrect .tessera-mc-radio-custom {
    border-color: var(--tessera-error);
  }

  .tessera-mc-option.incorrect .tessera-mc-radio-custom::after {
    background: var(--tessera-error);
  }

  .tessera-mc-option-text {
    flex: 1;
    line-height: 1.5;
    color: var(--tessera-text);
  }

  .tessera-mc-feedback {
    width: 100%;
    font-size: 0.875rem;
    padding: var(--tessera-spacing-sm) 0 0 calc(20px + var(--tessera-spacing-md));
    line-height: 1.4;
  }

  .tessera-mc-feedback.correct {
    color: var(--tessera-success);
  }

  .tessera-mc-feedback.incorrect {
    color: var(--tessera-error);
  }

  .tessera-mc-overall-feedback {
    margin-top: var(--tessera-spacing-md);
    padding: var(--tessera-spacing-md);
    border-radius: 6px;
    font-size: 0.9375rem;
  }

  .tessera-mc-overall-feedback.correct {
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
    color: var(--tessera-success);
  }

  .tessera-mc-overall-feedback.incorrect {
    background: color-mix(in srgb, var(--tessera-error) 8%, transparent);
    color: var(--tessera-error);
  }

  .tessera-mc-option:has(input:focus-visible) {
    outline: 2px solid var(--tessera-primary);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .tessera-mc-option {
      padding: var(--tessera-spacing-md);
    }
  }
</style>
