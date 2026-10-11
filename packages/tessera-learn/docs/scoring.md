# Scoring, success and completion

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

## Per-page weighting

Three top-level `pageConfig` fields control a page's share of the **course** score. All sit beside `quiz`, not inside it.

| Field      | Type      | Default | Effect                                                                            |
| ---------- | --------- | ------- | --------------------------------------------------------------------------------- |
| `graded`   | `boolean` | `false` | The page counts toward the course score                                           |
| `required` | `boolean` | `true`  | Graded only. `true`: counts as 0 until answered. `false`: left out until answered |
| `weight`   | `number`  | `1`     | How hard the page pulls, relative to other graded pages. Must be positive         |

```svelte
<script module>
  export const pageConfig = {
    title: 'Final Exam',
    weight: 75,
    quiz: { graded: true },
  };
</script>
```

Course score = `Σ(weight × pageScore) / Σ(weight)` over the graded pages, which are the same pages that decide success status. Weights are relative: make them sum to 100 to read as percentages, or use bare ratios like `2` and `3`. `validate`, `dev` and `export` print the effective percentages, and warn when percentage-style weights miss 100 or when a graded page beside weighted ones declares no `weight` (it counts as 1).

**A page is graded when it declares it.** `quiz: { graded: true }` covers quiz pages; `graded: true` beside `quiz: { graded: false }` is an error. A page whose graded content is standalone `useQuestion` calls needs `graded: true`, because the build cannot see a `useQuestion({ graded: true })` call inside your own component:

```svelte
<script module>
  export const pageConfig = { title: 'Final Exam', graded: true, weight: 75 };
</script>
```

- **Required graded pages count as 0 until answered**, so a skipped exam sinks the course score. The LMS gets no score until every required graded page is answered or the course is complete.
- **A page of standalone questions is answered once every graded question on it is**, including ones behind a reveal or `{#if}`. Until then, visiting it doesn't complete it under `completion.mode: "percentage"`.
- **Give every graded built-in question a literal `id="…"` and a bare `graded`.** A question the build can't read (a custom component, spread props, `graded={expr}`, `id={expr}`) counts only once it renders.
- **Don't split graded questions across the branches of an `{#if}`, `{#each}`/`{:else}` or `{#await}`.** A learner shown only one branch can never finish the page. `tessera validate` warns.
- **A graded question on a page without `graded: true` never reaches the course score or passed/failed.** `tessera validate` errors when it can see one, and `tessera dev` throws when one renders. `weight` on an undeclared page is ignored.

**`required: false` makes a graded page optional.** Use it for practice quizzes beside a required exam:

```svelte
<script module>
  export const pageConfig = {
    title: 'Practice',
    required: false,
    quiz: { graded: true }, // or graded: true on a standalone page
  };
</script>
```

- **`required` doesn't change page completion.** Under `completion.mode: "percentage"` and `navigation.mode: "sequential"` an optional page counts as completed, and unlocks the next page, only once answered, like any graded page.
- **An optional page answered after a pass never lowers what the LMS has**; see [Success criterion](#success-criterion). Use `graded: false` if a page's score should never move the course score.
- **`completion.mode: "quiz"` needs a required graded page.** `tessera validate` errors without one.

A page's own score is the weighted mean of the **graded** standalone questions answered on it. Practice questions (`graded: false`, the default) never count, so they are safe to mix onto a graded page. Give a `graded: true` page at least one graded question: with none it never earns a score, never completes and never unlocks the next page. `tessera validate` warns.

## Manual completion

Use `completion.mode: "manual"` when the author owns the completion moment (final page read, "click to acknowledge") rather than a quiz score or visit ratio. Two triggers, both always active; first-to-fire wins, re-marks are idempotent (completion is monotonic: you can't un-complete):

- **Page frontmatter**: `completesOn: "view"` (the only value) in a page's `pageConfig`; fires when that page renders.
- **Runtime hook**: `useCompletion().markComplete()`, composed with any event (modal close, video-ended, timer). Outside manual mode it's a no-op with a one-shot dev warning, so it's safe in shared components.

```svelte
<script module>
  export const pageConfig = { title: "You're done", completesOn: 'view' };
</script>
```

```svelte
<script>
  import { useCompletion } from 'tessera-learn';
  const { markComplete, completionStatus } = useCompletion();
</script>

<button
  onclick={() => markComplete()}
  disabled={completionStatus === 'complete'}
>
  I acknowledge
</button>
```

**Build-time check:** `completion: { mode: "manual", trigger: "page" }` fails the build when no page declares `completesOn: "view"`. Omitted, the dev runtime warns once after 60s if completion hasn't fired.

### Success status

By default `successStatus` stays `"unknown"`. Set `requireSuccessStatus: "passed"` (or `"failed"`) for an automatic pass alongside completion. It is an alias for `success: { from: "fixed", status }`; see [Success criterion](#success-criterion) to judge a quiz instead.

| Adapter        | `markComplete()`, default                                       | with `requireSuccessStatus: "passed"` |
| -------------- | --------------------------------------------------------------- | ------------------------------------- |
| SCORM 1.2      | `lesson_status = "completed"`                                   | `lesson_status = "passed"`            |
| SCORM 2004 4th | `completion_status = "completed"`, `success_status = "unknown"` | `success_status = "passed"`           |
| cmi5           | **Completed** (no Passed/Failed)                                | **Passed** alongside **Completed**    |
| xapi           | **Completed** (no Passed/Failed)                                | **Passed** alongside **Completed**    |
| web            | `localStorage` only                                             | `localStorage` only                   |

### Rules and non-goals

- A graded quiz reports its score but does **not** drive completion under manual: `markComplete()`/`completesOn` does. It drives success only under `success: { from: "quiz" }` (without it the build warns; set `graded: false` to silence).
- Per-learner conditional **completion** → use `useCompletion()` in a custom `$effect`/component, not config.

## Success criterion

`completion.mode` decides what makes a course **complete**. `success` decides what makes it **passed**, independently. Omit `success` and the mode supplies it:

| `completion.mode` | implied `success`                                                                   |
| ----------------- | ----------------------------------------------------------------------------------- |
| `"quiz"`          | `{ from: "quiz" }`                                                                  |
| `"percentage"`    | `{ from: "quiz" }`                                                                  |
| `"manual"`        | `{ from: "fixed", status: requireSuccessStatus }` when set, else `{ from: "none" }` |

| `success.from` | Verdict                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"quiz"`       | graded average vs `scoring.passingScore`: `failed` once every required graded page has a score or the course completes, `passed` once the course completes |
| `"fixed"`      | asserts `status` (`"passed"` / `"failed"`) when the course completes                                                                                       |
| `"none"`       | never sends a verdict; completion and score still report                                                                                                   |

```js
completion: { mode: 'manual' },
success: { from: 'quiz' },   // trigger completes, quiz decides pass/fail
```

- Under `completion.mode: "manual"` with `success: { from: "quiz" }`, `passingScore` defaults to 70 rather than manual mode's 0.
- **A `passed` is never taken back**, even when the score later drops or the learner resumes. From the pass on the LMS keeps the best score reached, and a completion is never taken back either. A `failed` can still turn into `passed`.
- **A learner who completes without attempting a required graded page reads `failed`** (it counts as 0). A skipped optional page leaves the average instead, so a course whose graded pages are all optional and all skipped stays `"unknown"`.
- **cmi5 `moveOn` is `CompletedAndPassed`** whenever the course is sure to send a verdict: a fixed one, or a quiz one with at least one **required** graded page. Otherwise it is `Completed`, so a verdict sent off optional pages alone never gates credit.
- Set `success: { from: "none" }` for a graded quiz that reports a score but should not gate credit. `tessera validate` warns when a quiz verdict has no required page to judge.
