<script>
  import { untrack } from 'svelte';
  import { useQuestion } from '../runtime/hooks.svelte.js';
  import {
    QUESTION_ID_PREFIX,
    indexIds,
    questionId,
    savedIndex,
  } from './util.js';
  import QuestionShell from './QuestionShell.svelte';
  import QuestionReview from './QuestionReview.svelte';

  /**
   * @type {{
   *   id?: string;
   *   question: string;
   *   options: string[];
   *   correct: number;
   *   optionFeedback?: string[];
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
    options,
    correct,
    correctFeedback = '',
    incorrectFeedback = '',
    optionFeedback = [],
    graded,
    maxRetries,
    weight = 1,
  } = $props();

  let selectedOption = $state(null);
  const chosenFeedback = $derived(optionFeedback[selectedOption]);
  let radioGroup;

  const componentId = $props.id();
  const groupId = `mc-${componentId}`;

  const q = useQuestion({
    get id() {
      return questionId(id, QUESTION_ID_PREFIX.MultipleChoice, question);
    },
    graded: untrack(() => graded),
    weight: untrack(() => weight),
    maxRetries: untrack(() => maxRetries),
    response: () => ({
      type: 'choice',
      response: selectedOption !== null ? [String(selectedOption)] : [],
      correct: [String(correct)],
      options: indexIds(options),
    }),
    reset: () => {
      selectedOption = null;
    },
    restore: (response) => {
      selectedOption = savedIndex(response[0], options);
      return selectedOption;
    },
  });

  function handleSelect(optIndex) {
    if (q.locked) return;
    selectedOption = optIndex;
    q.setAnswer(optIndex);
  }

  // Enter picks the focused option as Space does, matching screen reader
  // browse modes that activate a radio on Enter.
  function selectOnEnter(e, optIndex) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleSelect(optIndex);
  }

  function isCorrectOption(optIndex) {
    return optIndex === correct;
  }

  function getOptionClass(optIndex) {
    if (!q.feedbackVisible) return '';
    if (isCorrectOption(optIndex)) return 'correct';
    if (optIndex === selectedOption) return 'incorrect';
    return '';
  }
</script>

<QuestionShell {q} class="tessera-mc">
  <p class="tessera-mc-question" id="{groupId}-label">{question}</p>

  <div
    bind:this={radioGroup}
    class="tessera-mc-options"
    role="radiogroup"
    aria-labelledby="{groupId}-label"
  >
    {#each options as option, i (i)}
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
          disabled={q.locked}
          onchange={() => handleSelect(i)}
          onkeydown={(e) => selectOnEnter(e, i)}
        />
        <span class="tessera-mc-radio-custom"></span>
        <span class="tessera-mc-option-text">{option}</span>
        {#if stateClass}
          <span class="tessera-sr-only">({stateClass})</span>
        {/if}

        {#if q.feedbackVisible && optionFeedback[i]}
          <!-- The result below repeats the chosen option's feedback. -->
          <span
            class="tessera-mc-feedback {stateClass}"
            aria-hidden={isSelected ? 'true' : undefined}
            >{optionFeedback[i]}</span
          >
        {/if}
      </label>
    {/each}
  </div>

  <QuestionReview
    {q}
    correctFeedback={chosenFeedback ? '' : correctFeedback}
    incorrectFeedback={chosenFeedback ? '' : incorrectFeedback}
    firstControl={() => radioGroup?.querySelector('input')}
  >
    {#if chosenFeedback}
      <span class="tessera-sr-only">{chosenFeedback}</span>
    {/if}
  </QuestionReview>
</QuestionShell>

<style>
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
    transition:
      border-color 0.2s,
      background 0.2s;
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
    background: var(--tessera-success-bg);
  }

  .tessera-mc-option.incorrect {
    border-color: var(--tessera-error);
    background: var(--tessera-error-bg);
  }

  .tessera-mc-option input[type='radio'] {
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
    transition:
      border-color 0.2s,
      background 0.2s;
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
    padding: var(--tessera-spacing-sm) 0 0
      calc(20px + var(--tessera-spacing-md));
    line-height: 1.4;
  }

  .tessera-mc-feedback.correct {
    color: var(--tessera-success);
  }

  .tessera-mc-feedback.incorrect {
    color: var(--tessera-error);
  }

  .tessera-mc-option:has(input:focus-visible) {
    outline: var(--tessera-focus-outline);
    outline-offset: 2px;
    box-shadow: var(--tessera-focus-halo);
  }

  @media (max-width: 640px) {
    .tessera-mc-option {
      padding: var(--tessera-spacing-md);
    }
  }
</style>
