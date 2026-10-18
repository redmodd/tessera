# Hooks Reference

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

Seven hooks plus two helpers. Each hook is synchronous and must be called during component setup inside a Tessera course. The built-in components use only these exports, so anything a built-in does, a custom component can do too.

```js
import {
  useQuestion,
  useQuiz,
  useNavigation,
  useProgress,
  useCompletion,
  usePersistence,
  useCourse,
  isCorrect,
  resolveAsset,
} from 'tessera-learn';
import type { Interaction } from 'tessera-learn';
```

## The `Question` model

`useQuiz()` and `useQuestion()` share the same per-question object: a shell iterates `quiz.questions`, a widget gets its `Question` from `useQuestion()`. No indexes, no `getContext`.

```ts
interface Question {
  readonly id: string;
  readonly submitted: boolean;
  readonly correct: boolean | null; // null while answering, and null on a quiz restored without its answers (see `useQuiz().restored`)
  readonly answer: unknown;
  readonly answerComplete: boolean; // is the answer whole enough to submit? false at 2 of 5 pairs matched
  readonly feedbackVisible: boolean;
  readonly locked: boolean; // input read-only: submitted OR feedbackVisible OR isLockedCorrect
  readonly isLockedCorrect: boolean; // quiz: retry policy preserved this as already-correct. standalone: submitted scoring 100, no retry
  readonly render: unknown; // snippet the widget registered; shell calls {@render q.render()}
  setAnswer(answer: unknown): void;
  commit(): void; // report this answer to the LMS now. Idempotent. The shell calls it once the answer is final.
}
```

Gate input on `q.locked`. In a quiz, branch on `q.isLockedCorrect` only to render the "already correct" banner.

A widget that builds its answer incrementally (matching, ordering, multi-select) must pass `complete` to `useQuestion()`. Without it the shell treats the first `setAnswer()` as a finished answer and offers to submit half of one. Read reactive state inside it (`matches.size === pairs.length` over a `SvelteMap`), or the shell's button gating never updates.

`Interaction` uses SCORM 2004 vocabulary. Omit `correct` to skip auto-judging (`useQuestion` reports `null` correctness; your widget renders its own UI).

```ts
type Interaction =
  | {
      type: 'choice';
      response: string[];
      correct?: string[];
      options?: string[];
    }
  | {
      type: 'sequencing';
      response: string[]; // ordered ids
      correct?: string[];
      options?: string[];
    }
  | { type: 'true-false'; response: boolean; correct?: boolean }
  | {
      type: 'fill-in' | 'long-fill-in';
      response: string;
      correct?: string[]; // accepted answers
      caseMatters?: boolean;
    }
  | {
      type: 'matching';
      response: [string, string][];
      correct?: [string, string][];
      optionPairs?: { left: string[]; right: string[] };
    }
  | {
      type: 'numeric';
      response: number;
      correct?: { min?: number; max?: number };
    }
  | { type: 'likert' | 'other'; response: string; correct?: string }
  | {
      type: 'performance';
      response: [string, string | number][]; // [stepId, value]
      correct?: [string, string | number][];
    };
```

For `choice` / `sequencing` / `matching`, always pass the full option list via `options` (or `optionPairs` for matching), even when the ids are indexes like `'0'`. cmi5, xAPI and SCORM 2004 record the ids (see below); SCORM 1.2 accepts only one-character ids, so it records each id as its position in `options` (`0`-`9`, then `a`-`z`: up to 36 options). On SCORM 1.2:

- An id missing from `options`, or past option 36, leaves that response or correct pattern out of the LMS record with a console warning. The result is still recorded.
- Without `options`, ids are slugged as written, and strict LMSs reject any id that is not one character from `0`-`9` or `a`-`z`. Tessera logs a console warning when it sends one.

Ids inside a response (list items, matching ids, `performance` step ids, the `likert` value) must be SCORM identifiers. Send short ids (`strongly_agree`), not display text, and show the label in the widget. SCORM 2004 percent-encodes other characters (`Strongly agree` → `Strongly%20agree`) and SCORM 1.2 slugs them (`Step 1` → `Step_1`); cmi5 and xAPI send ids as written. Give ids that differ in letters or digits: Tessera warns when two ids in one response record as the same id (`a b` and `a-b` both become `a_b` on SCORM 1.2). Step values are sent as written. Choice and matching answers record each item once. SCORM 2004 leaves a response or correct answer out of the LMS record, with a console warning, when it:

- is an empty list, or has a step with neither an id nor a value
- has a step value holding `[,]`, `[.]` or `[:]` (other than a correct `min[:]max` range)
- is a correct answer (or a `fill-in` alternative) that repeats an item
- is a correct answer (or a `fill-in` alternative) starting or ending in whitespace

```ts
response: () => ({
  type: 'choice',
  response: selected ? [selected] : [],
  correct: ['speed-limit'],
  options: ['stop', 'yield', 'speed-limit', 'merge'],
});
// SCORM 1.2 → "2"   SCORM 2004 → "speed-limit"   cmi5 → "speed-limit"

// sequencing: response/correct are ordered id lists; options carries every id
response: () => ({
  type: 'sequencing',
  response: order, // e.g. ['mercury', 'venus', 'earth']
  correct: ['mercury', 'venus', 'earth'],
  options: ['venus', 'earth', 'mercury'],
});
```

## `useQuestion`

Register a question widget so the runtime can submit, score, persist, and report it. Returns a `Question` plus standalone-only methods.

- **Inside a quiz:** the shell drives submission. The widget calls `setAnswer()` on input, `setRender(snippet)` once at mount, and reads `locked`/`feedbackVisible`/`answer`. The widget never reports; `useQuiz().submit()` reports every question. `submit()`/`retry()` are no-ops here.
- **Standalone:** the widget owns Check/Retry. Set `graded: true` to count toward the page score; the page also needs `pageConfig.graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string; // unique on the page; LMS interaction id (letters, digits, inner underscores)
  graded?: boolean; // standalone only
  response: () => Interaction | undefined; // current answer, or undefined while unanswered; read at submit (and on each commit())
  score?: () => number; // standalone-only override (0–100)
  weight?: number; // page-level rollup weight (default 1)
  maxRetries?: number; // standalone retry cap, counted across visits to the page (default Infinity); ignored inside a quiz
  complete?: () => boolean; // is the answer fully specified? default true
  reset?: () => void;
  restore?: (response: Interaction['response']) => unknown; // put a saved answer back, typed as your response()'s `response`; see "Returning to a question"
}): Question & {
  submit(): void; // standalone: own check. quiz: no-op
  reset(): void; // clear the answer; after a standalone submit, same as retry()
  retry(): void; // standalone: no-op unless canRetry. Always a no-op inside a quiz
  readonly canRetry: boolean; // standalone: true after a submit that scored under 100, until maxRetries is hit
  readonly retryCount: number; // standalone: retries spent, counted across visits to the page
  readonly mode: 'standalone' | 'quiz';
  setRender(render: unknown): void;
};
```

See [Recipe 2b](recipes.md#recipe-2b-custom-question-widget-for-a-custom-quiz-shell) for a full widget and [Recipe 3](recipes.md#recipe-3-graded-standalone-question) for a graded standalone.

### Returning to a question

A submitted answer is saved with the page's progress and comes back when the learner returns to the page, in the same session or a later one.

| Mode       | What comes back                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone | The question mounts `submitted` with its score, `correct` and `retryCount`. A score of 100 stays locked (`isLockedCorrect`, no `canRetry`); a lower one offers a retry until `maxRetries` is spent |
| Quiz       | The results, with the best attempt's answers ready to review                                                                                                                                       |

Pass `restore` to show the answer again. Rules:

- It is called once, inside `useQuestion()`, with the `response` value your `response()` returned at submit. Declare the state it writes **above** the `useQuestion()` call.
- Return what the widget passes to `setAnswer()`; it becomes `q.answer`. With no return value, `q.answer` is the response.
- A retry the learner clicked but did not resubmit is not saved: the question comes back showing the last submitted answer.
- A standalone widget needs a retry control (`{#if q.canRetry}` calling `q.retry()`). A wrong answer stays submitted and locked across visits, so without one the learner cannot answer again.

```js
let selected = $state(null);

const q = useQuestion({
  id,
  response: () => ({
    type: 'choice',
    response: selected !== null ? [String(selected)] : [],
    correct: [String(correct)],
    options: options.map((_, i) => String(i)),
  }),
  restore: ([choice]) => (selected = Number(choice)),
});
```

An answer does not come back when the widget has no `restore`, which also keeps it out of the save and raises a console warning in dev, or when the save had no room for it (see [the suspend data limits](export.md)). The score, `correct`, retries and lock still do: a standalone question mounts submitted with no answer shown, and a quiz reports `restored`.

## `useQuiz`

Orchestration hook for any `quiz.svelte` (and the built-in `<Quiz>`). Throws on a page without `pageConfig.quiz`.

- **A custom shell must render `children`**, visibly or hidden. Questions register only when they mount, so a shell that drops `children` has nothing to score.
- **Only `submit()` scores the quiz.** It reports every question to the LMS, records the page score and marks the quiz Completed/Passed/Failed.
- **`tessera-quiz-complete` is a notification, not the scoring path.** A shell that passes `element` gets it dispatched there after `submit()`. Dispatching it yourself is a build error.
- **Widgets call `setAnswer()` only; the shell decides when an answer is final.** Call `q.commit()` to report one question before the end (the built-in `<Quiz>` does when `feedbackMode: 'immediate'` reveals it), and still call `submit()` at the end.

```ts
function useQuiz(opts?: { element?: () => HTMLElement | null }): {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number; // 0–100, to 2 decimal places; the attempt just submitted, or the restored result
  readonly bestScore: number; // highest across attempts; this is what the LMS gets
  readonly passingScore: number; // resolved at runtime (config + LMS mastery override)
  readonly attemptCount: number;
  readonly restored: boolean; // results came from saved progress without their answers
  readonly feedbackMode: 'review' | 'immediate' | 'never'; // pageConfig.quiz value, default 'review'
  readonly maxAttempts: number; // pageConfig.quiz value, default Infinity
  submit(): void;
  retry(): void;
  startReview(): void;
  exitReview(): void;
  revealFeedback(q: Question): void; // immediate-feedback flow
};
```

- **Show `bestScore` whenever `bestScore > score`.** `score` is the latest attempt; the LMS and the navigation gate use `bestScore`.
- **Branch on `restored`.** A result restored from saved progress opens in the `submitted` state with the best score, the attempt count and that attempt's answers, ready to review. `restored` is `true` when the answers did not come back (see [Returning to a question](#returning-to-a-question)): every `q.correct` is `null`, `q.feedbackVisible` is `false`, and `startReview()` is a no-op. Show the score and a Retry button; don't offer Review or a per-question breakdown.
- **Read `passingScore` from this hook**, not from `course.config.js`: an LMS mastery score overrides the config at launch.

## `useNavigation`

```ts
function useNavigation(): {
  readonly currentPage: ManifestPage;
  readonly currentPageIndex: number;
  readonly pages: ManifestPage[];
  goTo(slug: string): void;
  goToIndex(index: number): void; // no-op for a locked page or an index that is not a whole number in range
  next(): void;
  prev(): void;
  readonly canGoNext: boolean; // false when the next page is locked
  readonly canGoPrev: boolean; // false when the previous page is locked
  canAccess(slug: string): boolean; // first page with that slug; slugs repeat across lessons
  canAccessIndex(index: number): boolean; // use this when iterating pages or sections
  readonly sections: ManifestSection[]; // course tree: { title, slug, lessons: [{ title, slug, pages }] }
  prefetch(index: number): void; // start loading a page's module, e.g. on hover; no-op for locked pages
};
```

Each `ManifestPage` exposes `slug`, `title`, and `index`.

## `useProgress`

```ts
function useProgress(): {
  readonly visitedPages: Set<number>;
  readonly completedPages: number; // visited pages, minus graded pages still awaiting a score
  quizScore(pageIndex: number): number | undefined; // 0–100, to 2 decimal places; undefined until the quiz is submitted
  pageScore(pageIndex?: number): number | undefined; // 0–100, to 2 decimal places; graded quiz score, else the page's graded standalone mean; undefined until answered. Defaults to the page on screen
  readonly gradedScore: { average: number; attempted: boolean }; // course-wide, to 2 decimal places; what successStatus is judged on
  readonly passingScore: number; // 0–100; reflects an LMS masteryScore override when one is supplied
  readonly chunkProgress: Map<number, number>; // pageIndex → highest revealed chunk index
  readonly completionStatus: 'incomplete' | 'complete'; // live, so it can drop after the LMS is told complete; the LMS stays complete
  readonly successStatus: 'unknown' | 'passed' | 'failed'; // passed only once the course completes, then held
  markVisited(pageIndex: number): void; // no-op for an index that is not a page in the course
  markChunk(pageIndex: number, chunkIndex: number): void; // same, and for a chunkIndex that is not a whole number
};
```

`pageScore`: a standalone-question page renders no score on its own, so read it and print it as is.

- **Only the questions answered so far count**, so a three-question page reads 100% after one correct answer. Print it once the page is done, or label it.
- **Only graded work counts.** Practice answers and an ungraded practice quiz read `undefined`.

`gradedScore`: the course average that `successStatus` is judged on. Use it for a course or module summary page; averaging `quizScore` by hand omits standalone questions and drifts from the LMS. `attempted` is `false` until at least one graded page is answered.

- **Unanswered required graded pages count as 0**, so a learner who has aced two of four equally weighted required quizzes reads 50%. Show it after the graded pages, or label it ("course score so far").
- **Print it as is.** Rounding it further can print "70%" beside `failed` when the average is 69.67.
- **Don't derive pass/fail from it.** Read `successStatus`. `passingScore` is 0 under manual mode with no quiz verdict, so guard any pass mark you display.

```svelte
<script>
  import { useProgress } from 'tessera-learn';
  const progress = useProgress();
  const { average, attempted } = $derived(progress.gradedScore);
</script>

{#if attempted}
  <p>Course score so far: {average}%</p>
  {#if progress.passingScore > 0}
    <p>Pass mark: {progress.passingScore}% &middot; {progress.successStatus}</p>
  {/if}
{/if}
```

## `useCompletion`

Active under `completion.mode: "manual"` only. See [Manual completion](scoring.md#manual-completion).

```ts
function useCompletion(): {
  markComplete(): void; // idempotent: only the first call per session has an effect
  readonly completionStatus: 'incomplete' | 'complete'; // live, same as useProgress().completionStatus
};
```

## `usePersistence<T>(key)`

Per-widget persistent state, JSON-serializable only: a value that isn't (a `BigInt`, a cycle) lasts the session but is left out of the save, with a console warning. Survives reload on every adapter (`localStorage` / SCORM `cmi.suspend_data` / xAPI State API). Reads sync; writes batched. Keys are namespaced per course. Keep values small: see the cap under [LMS behaviour](export.md#lms-behaviour).

```ts
function usePersistence<T>(key: string): {
  get(): T | null;
  set(value: T): void;
};
```

```js
const store = usePersistence('notes:v1');
let notes = $state(store.get() ?? '');
$effect(() => store.set(notes));
```

Not for a question's answer: `useQuestion({ restore })` brings a submitted answer back.

## `useCourse`

Course identity from `course.config.js`, for layouts and headers, and the session's exit. Use it instead of importing the config file.

```ts
function useCourse(): {
  readonly title: string;
  readonly logo: string | undefined; // branding.logo with $assets/ resolved, ready for <img src>; undefined when unset or empty
  readonly canExit: boolean; // true under an LMS once the launch finishes, until the session ends; false on the web
  exit(): Promise<void>;
};
```

`exit()`:

- Saves progress and ends the LMS session. Does nothing while `canExit` is false.
- Sends the learner to the cmi5 `returnURL` when there is one; otherwise shows a "Session ended" screen.
- Does not confirm, and the session cannot resume. The default layout's **Exit course** button confirms first; a custom layout must confirm in a `<dialog>`, never `window.confirm()` (sandboxed LMS iframes make it return false without asking).

```svelte
<script>
  import { useCourse } from 'tessera-learn';
  const course = useCourse();
  let confirmExit = $state();
</script>

{#if course.canExit}
  <button onclick={() => confirmExit.showModal()}>Exit course</button>
  <dialog bind:this={confirmExit} aria-label="Exit the course?">
    <p>Exit the course? Your progress will be saved.</p>
    <button onclick={() => confirmExit.close()}>Cancel</button>
    <button onclick={() => course.exit()}>Exit course</button>
  </dialog>
{/if}
```

## `isCorrect(interaction)`

Pure helper. Returns `true`, `false`, or `null` (when the interaction has no `correct`).

```ts
function isCorrect(i: Interaction): boolean | null;
```
