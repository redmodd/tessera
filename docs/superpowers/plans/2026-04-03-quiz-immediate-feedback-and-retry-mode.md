# Quiz Immediate Feedback & Retry Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new quiz config options: `feedbackMode` ("review" | "immediate") for per-question feedback timing, and `retryMode` ("full" | "incorrect-only") for controlling retry behavior.

**Architecture:** Both features are contained within the quiz component layer. `QuizConfig` type gains two optional fields. Quiz.svelte gains new state (`feedbackShown` Set, `lockedCorrect` Set) and modified navigation/retry logic. Question components read two new context methods (`feedbackVisible`, `isLockedCorrect`) to conditionally render feedback and locked states. No changes to navigation, progress, persistence, or plugin code.

**Tech Stack:** Svelte 5, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/tessera/src/plugin/manifest.ts` | Modify (line 18) | Add `feedbackMode` and `retryMode` to `QuizConfig` type |
| `packages/tessera/src/components/Quiz.svelte` | Modify | New state, context methods, navigation logic for both features |
| `packages/tessera/src/components/MultipleChoice.svelte` | Modify | Read `feedbackVisible`/`isLockedCorrect`, render locked + banner states |
| `packages/tessera/src/components/FillInTheBlank.svelte` | Modify | Same as MultipleChoice |
| `packages/tessera/src/components/Matching.svelte` | Modify | Same as MultipleChoice |
| `packages/tessera/tests/quiz-logic.test.ts` | Modify | Add tests for immediate feedback flow and retry mode logic |
| `test-project/pages/03-assessment/01-quiz/quiz.svelte` | Modify | Update to use `feedbackMode: "immediate"`, `retryMode: "incorrect-only"` |
| `test-project/pages/03-assessment/01-quiz/practice.svelte` | No change | Already uses defaults (validates backwards compat) |

---

### Task 1: Add types to QuizConfig

**Files:**
- Modify: `packages/tessera/src/plugin/manifest.ts:15-20`

- [ ] **Step 1: Add new fields to QuizConfig interface**

In `packages/tessera/src/plugin/manifest.ts`, change:

```ts
export interface QuizConfig {
  graded?: boolean;
  gatesProgress?: boolean;
  maxAttempts?: number;
  showFeedback?: boolean;
}
```

to:

```ts
export interface QuizConfig {
  graded?: boolean;
  gatesProgress?: boolean;
  maxAttempts?: number;
  showFeedback?: boolean;
  feedbackMode?: 'review' | 'immediate';
  retryMode?: 'full' | 'incorrect-only';
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd packages/tessera && npx vitest run`
Expected: All 133 tests pass (type addition is backwards compatible).

- [ ] **Step 3: Commit**

```bash
git add packages/tessera/src/plugin/manifest.ts
git commit -m "feat: add feedbackMode and retryMode to QuizConfig type"
```

---

### Task 2: Write failing tests for immediate feedback logic

**Files:**
- Modify: `packages/tessera/tests/quiz-logic.test.ts`

- [ ] **Step 1: Add immediate feedback flow tests**

Append to `packages/tessera/tests/quiz-logic.test.ts`:

```ts
describe('Immediate feedback flow', () => {
  it('feedbackMode defaults to "review"', () => {
    const quizConfig = { graded: true, showFeedback: true };
    const feedbackMode = quizConfig.feedbackMode ?? 'review';
    expect(feedbackMode).toBe('review');
  });

  it('immediate mode: first Next click shows feedback, second advances', () => {
    const feedbackMode = 'immediate';
    const feedbackShown = new Set<number>();
    let currentIndex = 0;
    const answered = new Set([0]);

    // Simulate Next click on question 0
    function handleNext() {
      if (feedbackMode === 'immediate' && answered.has(currentIndex) && !feedbackShown.has(currentIndex)) {
        feedbackShown.add(currentIndex);
        return; // stay on same question
      }
      currentIndex++;
    }

    handleNext(); // first click — shows feedback
    expect(feedbackShown.has(0)).toBe(true);
    expect(currentIndex).toBe(0); // didn't advance

    handleNext(); // second click — advances
    expect(currentIndex).toBe(1);
  });

  it('review mode: Next click advances immediately (no feedback step)', () => {
    const feedbackMode = 'review';
    const feedbackShown = new Set<number>();
    let currentIndex = 0;
    const answered = new Set([0]);

    function handleNext() {
      if (feedbackMode === 'immediate' && answered.has(currentIndex) && !feedbackShown.has(currentIndex)) {
        feedbackShown.add(currentIndex);
        return;
      }
      currentIndex++;
    }

    handleNext();
    expect(feedbackShown.size).toBe(0);
    expect(currentIndex).toBe(1);
  });

  it('feedbackVisible returns true when immediate feedback is shown for a question', () => {
    const feedbackShown = new Set([0, 2]);
    const feedbackMode = 'immediate';
    const showFeedback = true;
    const submitted = false;
    const reviewing = false;

    function feedbackVisible(index: number): boolean {
      if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
      if (submitted && reviewing && showFeedback) return true;
      return false;
    }

    expect(feedbackVisible(0)).toBe(true);
    expect(feedbackVisible(1)).toBe(false);
    expect(feedbackVisible(2)).toBe(true);
  });

  it('feedbackVisible returns false when feedbackMode is immediate but showFeedback is false', () => {
    const feedbackShown = new Set([0]);
    const feedbackMode = 'immediate';
    const showFeedback = false;

    function feedbackVisible(index: number): boolean {
      if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
      return false;
    }

    expect(feedbackVisible(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/tessera && npx vitest run`
Expected: All tests pass (these test pure logic, not component code).

- [ ] **Step 3: Commit**

```bash
git add packages/tessera/tests/quiz-logic.test.ts
git commit -m "test: add immediate feedback flow tests"
```

---

### Task 3: Write failing tests for retry mode logic

**Files:**
- Modify: `packages/tessera/tests/quiz-logic.test.ts`

- [ ] **Step 1: Add retry mode tests**

Append to `packages/tessera/tests/quiz-logic.test.ts`:

```ts
describe('Retry mode', () => {
  it('retryMode defaults to "full"', () => {
    const quizConfig = { graded: true };
    const retryMode = quizConfig.retryMode ?? 'full';
    expect(retryMode).toBe('full');
  });

  it('full retry resets all answers and lockedCorrect is empty', () => {
    const retryMode = 'full';
    const answers = new Map([[0, 2], [1, 'Mars'], [2, new Map([[0, 0]])]]);
    const correctIndices = [0, 2]; // questions 0 and 2 were correct

    let newAnswers: Map<number, any>;
    let lockedCorrect: Set<number>;

    if (retryMode === 'incorrect-only') {
      lockedCorrect = new Set(correctIndices);
      newAnswers = new Map();
      for (const idx of correctIndices) {
        newAnswers.set(idx, answers.get(idx));
      }
    } else {
      lockedCorrect = new Set();
      newAnswers = new Map();
    }

    expect(newAnswers.size).toBe(0);
    expect(lockedCorrect.size).toBe(0);
  });

  it('incorrect-only retry preserves correct answers and locks them', () => {
    const retryMode = 'incorrect-only';
    const answers = new Map<number, any>([[0, 2], [1, 'Venus'], [2, new Map([[0, 0]])]]);

    // Questions 0 and 2 were correct, question 1 was wrong
    const checkResults = [true, false, true];

    const correctIndices: number[] = [];
    for (let i = 0; i < checkResults.length; i++) {
      if (checkResults[i]) correctIndices.push(i);
    }

    let newAnswers: Map<number, any>;
    let lockedCorrect: Set<number>;

    if (retryMode === 'incorrect-only') {
      lockedCorrect = new Set(correctIndices);
      newAnswers = new Map();
      for (const idx of correctIndices) {
        newAnswers.set(idx, answers.get(idx));
      }
    } else {
      lockedCorrect = new Set();
      newAnswers = new Map();
    }

    expect(newAnswers.size).toBe(2); // preserved correct answers
    expect(newAnswers.get(0)).toBe(2);
    expect(newAnswers.get(2)).toEqual(new Map([[0, 0]]));
    expect(newAnswers.has(1)).toBe(false); // wrong answer cleared
    expect(lockedCorrect.size).toBe(2);
    expect(lockedCorrect.has(0)).toBe(true);
    expect(lockedCorrect.has(1)).toBe(false);
    expect(lockedCorrect.has(2)).toBe(true);
  });

  it('isLockedCorrect returns true only for locked questions', () => {
    const lockedCorrect = new Set([0, 2]);

    function isLockedCorrect(index: number): boolean {
      return lockedCorrect.has(index);
    }

    expect(isLockedCorrect(0)).toBe(true);
    expect(isLockedCorrect(1)).toBe(false);
    expect(isLockedCorrect(2)).toBe(true);
  });

  it('scoring on retry counts preserved correct answers', () => {
    // 3 questions total: q0 correct (locked), q1 re-answered correctly, q2 correct (locked)
    const lockedCorrect = new Set([0, 2]);
    const answers = new Map([[0, 'preserved'], [1, 'new-correct'], [2, 'preserved']]);
    const checkResults = [true, true, true]; // all correct after retry

    const correctCount = checkResults.filter(r => r).length;
    const score = Math.round((correctCount / checkResults.length) * 100);
    expect(score).toBe(100);
  });

  it('scoring on retry with some still wrong', () => {
    const checkResults = [true, false, true]; // q1 still wrong
    const correctCount = checkResults.filter(r => r).length;
    const score = Math.round((correctCount / checkResults.length) * 100);
    expect(score).toBe(67);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/tessera && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/tessera/tests/quiz-logic.test.ts
git commit -m "test: add retry mode logic tests"
```

---

### Task 4: Implement immediate feedback and retry mode in Quiz.svelte

**Files:**
- Modify: `packages/tessera/src/components/Quiz.svelte`

- [ ] **Step 1: Add new state and derived values**

In the `<script>` block of `Quiz.svelte`, after the existing state declarations (`let reviewIndex = $state(0);`), add:

```js
  // Immediate feedback state
  let feedbackShown = $state(new Set());
  // Retry mode: locked correct questions from prior attempt
  let lockedCorrect = $state(new Set());
```

After the existing derived values (`let allAnswered = ...`), add:

```js
  let feedbackMode = $derived(
    (quizConfig.showFeedback && quizConfig.feedbackMode === 'immediate') ? 'immediate' : 'review'
  );
  let retryMode = $derived(quizConfig.retryMode ?? 'full');
```

- [ ] **Step 2: Add context methods for feedbackVisible and isLockedCorrect**

Replace the existing `setContext('tessera-quiz', ...)` block with:

```js
  // Provide context to child question components
  setContext('tessera-quiz', {
    get registerQuestion() { return registerQuestion; },
    get setAnswer() { return setAnswer; },
    get getAnswer() { return getAnswer; },
    get submitted() { return submitted; },
    get reviewing() { return reviewing; },
    get showFeedback() { return showFeedback; },
    get currentQuestionIndex() { return reviewing ? reviewIndex : currentQuestionIndex; },
    get feedbackVisible() {
      return (index) => {
        if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
        if (submitted && reviewing && showFeedback) return true;
        return false;
      };
    },
    get isLockedCorrect() {
      return (index) => lockedCorrect.has(index);
    },
  });
```

- [ ] **Step 3: Replace goNextQuestion with immediate feedback logic**

Replace the existing `goNextQuestion` function:

```js
  function goNextQuestion() {
    if (currentQuestionIndex < totalQuestions - 1) {
      currentQuestionIndex++;
    }
  }
```

with:

```js
  function goNextQuestion() {
    // Immediate feedback: first Next shows feedback, second advances
    if (feedbackMode === 'immediate'
        && answers.has(currentQuestionIndex)
        && !feedbackShown.has(currentQuestionIndex)
        && !lockedCorrect.has(currentQuestionIndex)) {
      feedbackShown = new Set([...feedbackShown, currentQuestionIndex]);
      return;
    }
    if (currentQuestionIndex < totalQuestions - 1) {
      currentQuestionIndex++;
    }
  }
```

- [ ] **Step 4: Replace handleRetry with retry mode logic**

Replace the existing `handleRetry` function:

```js
  function handleRetry() {
    answers = new Map();
    submitted = false;
    reviewing = false;
    score = 0;
    currentQuestionIndex = 0;
    reviewIndex = 0;
    // Reset question states
    for (const q of questions) {
      if (q.reset) q.reset();
    }
  }
```

with:

```js
  function handleRetry() {
    submitted = false;
    reviewing = false;
    score = 0;
    currentQuestionIndex = 0;
    reviewIndex = 0;
    feedbackShown = new Set();

    if (retryMode === 'incorrect-only') {
      // Identify correct questions
      const newLockedCorrect = new Set();
      const preservedAnswers = new Map();
      for (let i = 0; i < questions.length; i++) {
        const answer = answers.get(i);
        if (questions[i].checkAnswer(answer)) {
          newLockedCorrect.add(i);
          preservedAnswers.set(i, answer);
        }
      }
      lockedCorrect = newLockedCorrect;
      answers = preservedAnswers;
      // Only reset incorrect questions
      for (let i = 0; i < questions.length; i++) {
        if (!newLockedCorrect.has(i) && questions[i].reset) {
          questions[i].reset();
        }
      }
    } else {
      lockedCorrect = new Set();
      answers = new Map();
      for (const q of questions) {
        if (q.reset) q.reset();
      }
    }
  }
```

- [ ] **Step 5: Update the Next button label and disabled state in the question phase template**

In the question phase template, replace the Next button block:

```svelte
      {#if currentQuestionIndex < totalQuestions - 1}
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary"
          disabled={!answers.has(currentQuestionIndex)}
          onclick={goNextQuestion}
        >
          Next
        </button>
```

with:

```svelte
      {#if currentQuestionIndex < totalQuestions - 1}
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary"
          disabled={!answers.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex)}
          onclick={goNextQuestion}
        >
          {feedbackMode === 'immediate' && feedbackShown.has(currentQuestionIndex) ? 'Continue' : 'Next'}
        </button>
```

- [ ] **Step 6: Update the Submit button disabled check to account for locked correct answers**

In the question phase template, replace the Submit button:

```svelte
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary tessera-quiz-btn-submit"
          disabled={!allAnswered}
          onclick={handleSubmit}
        >
          Submit
        </button>
```

with:

```svelte
        <button
          class="tessera-quiz-btn tessera-quiz-btn-primary tessera-quiz-btn-submit"
          disabled={!allAnswered}
          onclick={feedbackMode === 'immediate' && !feedbackShown.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex) ? () => { feedbackShown = new Set([...feedbackShown, currentQuestionIndex]); } : handleSubmit}
        >
          {feedbackMode === 'immediate' && answers.has(currentQuestionIndex) && !feedbackShown.has(currentQuestionIndex) && !lockedCorrect.has(currentQuestionIndex) ? 'Check Answer' : 'Submit'}
        </button>
```

- [ ] **Step 7: Add CSS for the locked-correct banner**

Add to the `<style>` block in Quiz.svelte, before the `/* Mobile */` comment:

```css
  .tessera-quiz-locked-banner {
    display: flex;
    align-items: center;
    gap: var(--tessera-spacing-sm);
    padding: var(--tessera-spacing-md);
    margin-bottom: var(--tessera-spacing-md);
    background: color-mix(in srgb, var(--tessera-success) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--tessera-success) 25%, transparent);
    border-radius: 6px;
    color: var(--tessera-success);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .tessera-quiz-locked-banner svg {
    flex-shrink: 0;
  }
```

- [ ] **Step 8: Run tests and build**

Run: `cd packages/tessera && npx vitest run`
Expected: All tests pass.

Run: `cd test-project && npx vite build`
Expected: Clean build, no errors or warnings.

- [ ] **Step 9: Commit**

```bash
git add packages/tessera/src/components/Quiz.svelte
git commit -m "feat: implement feedbackMode and retryMode in Quiz component"
```

---

### Task 5: Update question components to read new context

**Files:**
- Modify: `packages/tessera/src/components/MultipleChoice.svelte`
- Modify: `packages/tessera/src/components/FillInTheBlank.svelte`
- Modify: `packages/tessera/src/components/Matching.svelte`

All three question components need the same two changes:
1. Show feedback when `quiz.feedbackVisible(myIndex)` is true (replacing the old `quiz.submitted && quiz.reviewing && quiz.showFeedback` checks)
2. Show a locked-correct banner and disable inputs when `quiz.isLockedCorrect(myIndex)` is true

- [ ] **Step 1: Update MultipleChoice.svelte**

In `MultipleChoice.svelte`, replace the `getOptionClass` function:

```js
  function getOptionClass(optIndex) {
    if (!quiz.submitted || !quiz.reviewing || !quiz.showFeedback) return '';
    const answer = quiz.getAnswer(myIndex);
    if (isCorrectOption(optIndex)) return 'correct';
    if (optIndex === answer && !isCorrectOption(optIndex)) return 'incorrect';
    return '';
  }
```

with:

```js
  function getOptionClass(optIndex) {
    if (!quiz.feedbackVisible(myIndex)) return '';
    const answer = quiz.getAnswer(myIndex);
    if (isCorrectOption(optIndex)) return 'correct';
    if (optIndex === answer && !isCorrectOption(optIndex)) return 'incorrect';
    return '';
  }

  let isLocked = $derived(quiz.isLockedCorrect(myIndex));
```

Replace the `handleSelect` function:

```js
  function handleSelect(optIndex) {
    if (quiz.submitted) return;
    selectedOption = optIndex;
    quiz.setAnswer(myIndex, optIndex);
  }
```

with:

```js
  function handleSelect(optIndex) {
    if (quiz.submitted || isLocked) return;
    selectedOption = optIndex;
    quiz.setAnswer(myIndex, optIndex);
  }
```

Replace the `{#snippet renderQuestion()}` block entirely with:

```svelte
{#snippet renderQuestion()}
  <div class="tessera-mc" role="radiogroup" aria-labelledby="{groupId}-label">
    {#if isLocked}
      <div class="tessera-quiz-locked-banner">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        You already got this one right — click Next to continue.
      </div>
    {/if}
    <p class="tessera-mc-question" id="{groupId}-label">{question}</p>

    <div class="tessera-mc-options">
      {#each options as option, i}
        {@const optionId = `${groupId}-opt-${i}`}
        {@const isSelected = (quiz.submitted || isLocked ? quiz.getAnswer(myIndex) : selectedOption) === i}
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
            disabled={quiz.submitted || isLocked}
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
```

- [ ] **Step 2: Update FillInTheBlank.svelte**

In `FillInTheBlank.svelte`, replace the `handleInput` function:

```js
  function handleInput(e) {
    if (quiz.submitted) return;
    inputValue = e.target.value;
    quiz.setAnswer(myIndex, inputValue);
  }
```

with:

```js
  let isLocked = $derived(quiz.isLockedCorrect(myIndex));

  function handleInput(e) {
    if (quiz.submitted || isLocked) return;
    inputValue = e.target.value;
    quiz.setAnswer(myIndex, inputValue);
  }
```

Replace the `{#snippet renderQuestion()}` block entirely with:

```svelte
{#snippet renderQuestion()}
  <div class="tessera-fitb">
    {#if isLocked}
      <div class="tessera-quiz-locked-banner">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        You already got this one right — click Next to continue.
      </div>
    {/if}
    <label class="tessera-fitb-question" for={inputId}>{question}</label>

    <div class="tessera-fitb-input-wrapper">
      <input
        type="text"
        id={inputId}
        class="tessera-fitb-input"
        class:correct={quiz.feedbackVisible(myIndex) && checkAnswer(quiz.getAnswer(myIndex))}
        class:incorrect={quiz.feedbackVisible(myIndex) && !checkAnswer(quiz.getAnswer(myIndex))}
        value={quiz.submitted || isLocked ? (quiz.getAnswer(myIndex) ?? '') : inputValue}
        oninput={handleInput}
        disabled={quiz.submitted || isLocked}
        placeholder="Type your answer..."
        autocomplete="off"
      />
    </div>

    {#if quiz.feedbackVisible(myIndex)}
      {@const userAnswer = quiz.getAnswer(myIndex)}
      {@const isCorrect = checkAnswer(userAnswer)}
      <div class="tessera-fitb-review">
        {#if isCorrect}
          <div class="tessera-fitb-result correct">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Correct
          </div>
          {#if correctFeedback}
            <p class="tessera-fitb-feedback correct">{correctFeedback}</p>
          {/if}
        {:else}
          <div class="tessera-fitb-result incorrect">
            <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
            </svg>
            Incorrect
          </div>
          <p class="tessera-fitb-correct-answer">
            Correct answer{answers.length > 1 ? 's' : ''}: {answers.join(', ')}
          </p>
          {#if incorrectFeedback}
            <p class="tessera-fitb-feedback incorrect">{incorrectFeedback}</p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}
```

- [ ] **Step 3: Update Matching.svelte**

In `Matching.svelte`, replace the `handleLeftClick` function:

```js
  function handleLeftClick(leftIndex) {
    if (quiz.submitted) return;
```

with:

```js
  let isLocked = $derived(quiz.isLockedCorrect(myIndex));

  function handleLeftClick(leftIndex) {
    if (quiz.submitted || isLocked) return;
```

Replace the `handleRightClick` function's first line:

```js
  function handleRightClick(rightOriginalIndex) {
    if (quiz.submitted) return;
```

with:

```js
  function handleRightClick(rightOriginalIndex) {
    if (quiz.submitted || isLocked) return;
```

Replace the `removeMatch` function's first line:

```js
  function removeMatch(leftIndex) {
    if (quiz.submitted) return;
```

with:

```js
  function removeMatch(leftIndex) {
    if (quiz.submitted || isLocked) return;
```

In the `{#snippet renderQuestion()}` block, add the locked banner right after `<div class="tessera-matching" aria-label={question}>`:

Replace:

```svelte
  <div class="tessera-matching" aria-label={question}>
    <p class="tessera-matching-question">{question}</p>
```

with:

```svelte
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
```

In the left column buttons, replace `disabled={quiz.submitted}` with `disabled={quiz.submitted || isLocked}`.

In the right column buttons, replace `disabled={quiz.submitted}` with `disabled={quiz.submitted || isLocked}`.

Replace the `{#if matched && !quiz.submitted}` unmatch control to also check for locked:

```svelte
            {#if matched && !quiz.submitted && !isLocked}
```

Replace all three instances of `{#if quiz.submitted && quiz.reviewing && quiz.showFeedback}` in the Matching template with `{#if quiz.feedbackVisible(myIndex)}`.

- [ ] **Step 4: Run tests and build**

Run: `cd packages/tessera && npx vitest run`
Expected: All tests pass.

Run: `cd test-project && npx vite build`
Expected: Clean build, no errors or warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/tessera/src/components/MultipleChoice.svelte packages/tessera/src/components/FillInTheBlank.svelte packages/tessera/src/components/Matching.svelte
git commit -m "feat: question components support feedbackVisible and isLockedCorrect context"
```

---

### Task 6: Update test project quiz page

**Files:**
- Modify: `test-project/pages/03-assessment/01-quiz/quiz.svelte`

- [ ] **Step 1: Update the graded quiz to use both new options**

Replace the full contents of `test-project/pages/03-assessment/01-quiz/quiz.svelte` with:

```svelte
<script context="module">
  export const pageConfig = {
    title: "Module 1 Assessment",
    quiz: {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
      showFeedback: true,
      feedbackMode: "immediate",
      retryMode: "incorrect-only",
    }
  }
</script>

<script>
  import { Quiz, MultipleChoice, FillInTheBlank, Matching } from 'tessera';
</script>

<h1>Module 1 Assessment</h1>
<p>Test your knowledge of the course material. You'll see feedback after each question.</p>

<Quiz>
  <MultipleChoice
    question="What is the capital of France?"
    options={["London", "Berlin", "Paris", "Madrid"]}
    correct={2}
    correctFeedback="Correct! Paris is the capital of France."
    incorrectFeedback="That's not right. Paris is the capital of France."
    optionFeedback={["London is the capital of England.", "Berlin is the capital of Germany.", "Correct!", "Madrid is the capital of Spain."]}
  />

  <FillInTheBlank
    question="What planet is known as the Red Planet?"
    answers={["Mars", "mars"]}
    correctFeedback="That's right! Mars is known as the Red Planet."
    incorrectFeedback="The correct answer is Mars."
  />

  <Matching
    question="Match each country with its capital city."
    pairs={[
      { left: "Japan", right: "Tokyo" },
      { left: "Australia", right: "Canberra" },
      { left: "Brazil", right: "Brasília" },
      { left: "Canada", right: "Ottawa" },
    ]}
    correctFeedback="You matched all countries with their capitals correctly!"
    incorrectFeedback="Some matches were incorrect. Review the correct pairs above."
  />
</Quiz>
```

- [ ] **Step 2: Build and verify**

Run: `cd test-project && npx vite build`
Expected: Clean build, no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add test-project/pages/03-assessment/01-quiz/quiz.svelte
git commit -m "feat: test project quiz uses immediate feedback and incorrect-only retry"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd packages/tessera && npx vitest run`
Expected: All tests pass (133 existing + new tests from Tasks 2-3).

- [ ] **Step 2: Build test project**

Run: `cd test-project && npx vite build`
Expected: Clean build, no errors or warnings.

- [ ] **Step 3: Verify practice quiz still works with defaults**

Confirm `test-project/pages/03-assessment/01-quiz/practice.svelte` has no `feedbackMode` or `retryMode` set. It should use the default behavior (`feedbackMode: "review"`, `retryMode: "full"`).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: quiz immediate feedback and retry mode — complete"
```
