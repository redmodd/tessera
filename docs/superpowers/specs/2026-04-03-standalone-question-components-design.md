# Standalone Question Components

## Overview

Question components (MultipleChoice, FillInTheBlank, Matching) work in standalone mode when used outside a `<Quiz>` wrapper. They detect the absence of `tessera-quiz` context and switch to self-contained inline behavior. No new components, wrappers, or mode props needed.

## Standalone Behavior

- Feedback shows instantly on answer — no Submit button
- Inputs lock after answering (can't change answer)
- A "Try again" link appears after answering, controlled by `maxRetries` prop
- No scoring, no progress tracking, no interaction with ProgressState
- Works inline in normal page content flow — no layout takeover

## Usage

```svelte
<Video src="https://example.com/video.mp4" title="How DNS works" />

<MultipleChoice
  question="What does DNS stand for?"
  options={["Data Network System", "Domain Name System", "Digital Naming Service"]}
  correct={1}
  correctFeedback="Right! DNS translates domain names to IP addresses."
  incorrectFeedback="Not quite — it's Domain Name System."
  maxRetries={2}
/>

<p>Now that you understand DNS, let's look at how HTTP works...</p>

<FillInTheBlank
  question="What port does HTTPS use by default?"
  answers={["443"]}
  correctFeedback="Correct!"
  incorrectFeedback="HTTPS uses port 443."
/>
```

## Detection

Each question component already calls `getContext('tessera-quiz')` on init. If the context is `undefined`, the component is in standalone mode. No new props to toggle modes.

## Props

### `maxRetries`

- Type: `number`
- Default: `Infinity`
- Only used in standalone mode — inside `<Quiz>`, retry is controlled by `Quiz`'s `maxAttempts` config
- When retries are exhausted, the "Try again" link disappears and the question stays locked showing the correct answer with feedback

## Implementation Per Component

Each question component gains a standalone code path alongside the existing quiz-mode path:

### Standalone state (internal to each component)

- `answered: boolean` — whether the learner has answered
- `retryCount: number` — number of retries used
- `canRetry: boolean` — derived from `retryCount < maxRetries`

### Standalone rendering

- Renders the question with its existing markup (no wrapper chrome)
- On answer: immediately lock inputs, show correct/incorrect feedback (same visual treatment as quiz review mode)
- Show "Try again" link below feedback when `canRetry` is true
- "Try again" resets the component state, increments `retryCount`, unlocks inputs
- When retries exhausted: no "Try again" link, question stays locked with correct answer shown

### Quiz-mode path (unchanged)

When `getContext('tessera-quiz')` returns a context object, the component behaves exactly as today — registers with Quiz, delegates state to Quiz context, renders via snippet.

### Structural approach

The snippet-based rendering pattern (used for Quiz mode) won't work in standalone mode since there's no Quiz to call `{@render}`. In standalone mode the component renders directly — no snippet registration, no `onMount` registration call.

The template uses a conditional at the top level:
- If quiz context exists → existing snippet-based path (register, render via snippet)
- If no quiz context → render directly with standalone state management

## Defaults

- `maxRetries` defaults to `Infinity` — standalone questions are low-stakes practice by default
- All existing question component props work identically in both modes
- Components inside `<Quiz>` ignore `maxRetries` (Quiz's `maxAttempts` governs retry)
