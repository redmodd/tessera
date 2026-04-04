# Quiz: Immediate Feedback & Retry Mode

## Overview

Two new quiz configuration options:

1. **`feedbackMode`** — controls when per-question feedback is shown (after each question vs. after submission)
2. **`retryMode`** — controls whether retry resets all questions or only incorrect ones

## Config

```js
quiz: {
  graded: true,
  gatesProgress: true,
  maxAttempts: 3,
  showFeedback: true,
  feedbackMode: "immediate",   // "review" (default) | "immediate"
  retryMode: "incorrect-only", // "full" (default) | "incorrect-only"
}
```

### `feedbackMode`

- `"review"` (default) — current behavior. Feedback shown only during post-submission review mode.
- `"immediate"` — after the learner answers a question and clicks Next, the question locks and shows correct/incorrect status + feedback inline. The learner clicks Next again to advance.

Requires `showFeedback: true`. If `showFeedback` is false, `feedbackMode` is ignored.

### `retryMode`

- `"full"` (default) — current behavior. All questions reset on retry.
- `"incorrect-only"` — questions answered correctly on the prior attempt are pre-filled, locked, and marked with a "You already got this one right" banner. Only incorrect questions are reset for re-answering.

## Immediate Feedback Flow

1. Learner selects an answer → clicks Next
2. Question locks. Correct/incorrect status and feedback text appear inline (same visual treatment as review mode).
3. Next button label changes to "Continue".
4. Learner clicks Continue → advances to next question.
5. After the last question, Submit button appears. Answers are already locked, so Submit just calculates the score.
6. Results screen shows score. Review button still available.

### Implementation

Quiz.svelte gains a `feedbackShown` state (`Set<number>` of question indices where immediate feedback is visible).

When `feedbackMode === "immediate"` and the learner clicks Next:
- If current question is answered but not in `feedbackShown` → add to `feedbackShown`, stay on same question.
- If current question is in `feedbackShown` → advance to next question.

Question components check `quiz.feedbackVisible(index)` to know whether to render feedback inline. This returns true when:
- `feedbackMode === "immediate"` and the question index is in `feedbackShown`, OR
- `submitted && reviewing && showFeedback` (existing review mode behavior)

## Incorrect-Only Retry Flow

When the learner clicks Retry and `retryMode === "incorrect-only"`:

1. Quiz identifies which questions were correct using each question's `checkAnswer`.
2. Correct answers are preserved in the `answers` Map.
3. Correct question indices are added to a `lockedCorrect` Set.
4. Only incorrect questions have `reset()` called.
5. Quiz returns to question 1. `currentQuestionIndex` resets to 0.

Question components check `quiz.isLockedCorrect(index)`. When true:
- Inputs are disabled.
- The selected/entered answer is displayed but not editable.
- A banner appears: "✓ You already got this one right — click Next to continue."

On submission, scoring uses all answers (preserved correct + new attempts on incorrect).

## Quiz Context Additions

The `tessera-quiz` context object gains two new methods:

```ts
feedbackVisible(index: number): boolean
isLockedCorrect(index: number): boolean
```

## Types

`QuizConfig` in `manifest.ts` gains:

```ts
feedbackMode?: 'review' | 'immediate';
retryMode?: 'full' | 'incorrect-only';
```

## Defaults

Both fields are optional. Omitting them preserves current behavior exactly:
- `feedbackMode` defaults to `"review"`
- `retryMode` defaults to `"full"`
