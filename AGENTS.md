# AGENTS.md — Tessera Course Authoring Guide

Tessera is an **LMS tracking runtime** for interactive learning content. It handles SCORM 1.2 / SCORM 2004 / cmi5 / xAPI statements, progress state, completion and success rollup, persistence, and navigation gating — and gets out of the way for the presentation layer.

Build a course entirely with the built-in components, entirely with your own components via four hooks, or any mix. The built-ins are reference implementations. Replace any of them.

**Lock the data contract. Free the presentation.**

This file is the canonical reference for any agent (Claude Code, Cursor, Aider, codex, etc.) or human author working in a Tessera project. Read this before generating or editing course code.

---

## Project Structure

The framework imposes the **minimum** structure it needs to discover content. Everything else is convention you can opt into.

### Required

```
my-course/
├── course.config.js          # Course configuration
├── vite.config.js             # Vite config (do not modify)
├── package.json
└── pages/                     # Course content (at least one section dir with .svelte files)
    └── intro/
        └── welcome.svelte
```

That's it. `pages/` exists, contains one or more **section directories**, each containing one or more `.svelte` files (directly or inside lesson subdirectories). The runtime works with that alone.

### Optional

```
my-course/
├── layout.svelte              # Custom chrome (replaces default sidebar/topbar)
├── quiz.svelte                # Custom quiz shell (replaces built-in <Quiz>)
├── assets/                    # Images, audio, video files (referenced via $assets/)
├── styles/                    # Custom CSS overrides
├── AGENTS.md                  # This file
└── pages/
    └── 01-intro/              # Numeric prefix → controls order
        ├── _meta.js           # Override section title; control page order
        ├── welcome.svelte     # Page directly in the section ("flat" shape)
        └── 01-getting-started/  # Lesson subdirectory ("nested" shape)
            ├── _meta.js
            └── overview.svelte
```

### Hierarchy

The manifest is always **section → lesson → page**, but the lesson layer is synthesized when you don't want it:

- **Flat shape** — `.svelte` files directly in the section folder. The manifest creates one implicit lesson with the same title as the section.
- **Nested shape** — `.svelte` files inside lesson subdirectories under the section.
- **Mixed** — both shapes can coexist in the same section.

Use whichever fits the course size. A 10-page tutorial is fine flat; a 200-page certification course probably wants lessons.

### Naming and ordering

- Sections, lessons, and pages are sorted **alphabetically** by directory / filename.
- Optional **numeric prefixes** (`01-`, `02-`, …) on directories give you explicit ordering without renaming files: `01-getting-started/` sorts before `02-core-concepts/`.
- Prefixes are **stripped** from slugs and display names: `01-getting-started` → slug `getting-started`, default title "Getting Started".
- Page filenames typically skip the prefix (`welcome.svelte`, not `01-welcome.svelte`) since `_meta.js` controls order more cleanly — but a prefix on a page file works too; it's just part of the filename otherwise.

### `_meta.js` files

**Optional everywhere.** When absent, titles fall back to the title-cased slug.

```js
// section or lesson _meta.js — title override
export default { title: "Getting Started" };
```

```js
// lesson _meta.js — explicit page order
export default {
  title: "Welcome",
  pages: ["welcome", "objectives"],
};
```

Pages listed in `pages` come first in listed order; any unlisted `.svelte` files are appended alphabetically.

---

## Authoring Surfaces

There are exactly four:

1. **Built-in components** — `Callout`, `Image`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, etc., from `@redmondd/tessera`. Use, compose, or skip.
2. **Hooks** — `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `usePersistence`. The stable contract between custom widgets and the runtime. Anything the built-ins do, you can do.
3. **Custom layout** — drop `layout.svelte` at the project root to replace the default chrome.
4. **Custom quiz shell** — drop `quiz.svelte` at the project root to replace the built-in quiz UI for every page that has `pageConfig.quiz`. Authors call `useQuiz()` for state and dispatch; question widgets continue to register through `useQuestion`.

The built-ins are reference implementations of the hooks. Want a draggable timeline question? Write a Svelte component, call `useQuestion`, emit an `Interaction`. The runtime treats it identically to `<MultipleChoice>` — same scoring, same LMS reporting, same persistence.

---

## Creating Pages

Each page is a `.svelte` file inside a lesson folder.

### Basic page

```svelte
<h1>Welcome</h1>
<p>Standard HTML works as-is.</p>
```

### Page configuration

`pageConfig` sets the page title and configures quizzes. It must be a **static object literal** in a module script block — no variables, function calls, or computed values.

Both `<script module>` (Svelte 5) and `<script context="module">` (legacy) are accepted by the manifest parser.

```svelte
<script module>
  export const pageConfig = {
    title: "Introduction to the Topic",
  };
</script>

<h1>Introduction to the Topic</h1>
```

If `pageConfig.title` is omitted, the title is derived from the filename: `my-page.svelte` → "My Page".

### Importing components

```svelte
<script>
  import { Callout, Image } from '@redmondd/tessera';
</script>

<Callout type="info">
  <p>Helpful information.</p>
</Callout>
```

---

## Component Reference

All components import from `@redmondd/tessera`. Nothing is loaded automatically; import only what you use.

### Callout

Styled box for highlighting information.

| Prop | Type | Default |
|------|------|---------|
| `type` | `"info" \| "warning" \| "tip" \| "important"` | `"info"` |

Children become the body. A11y: `role="note"` with type-appropriate `aria-label`.

```svelte
<Callout type="warning"><p>Be careful.</p></Callout>
```

### Image

Lazy-loaded image with optional caption. Renders as `<figure>`/`<figcaption>`.

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` | Image URL. `$assets/` prefix supported |
| `alt` | `string` | **Required.** Alt text |
| `caption` | `string` | Optional caption |

```svelte
<Image src="$assets/diagram.png" alt="System architecture diagram" caption="Figure 1" />
```

### Accordion / AccordionItem

Expandable panels. Only one open at a time. A11y: `aria-expanded`, `aria-controls`, `role="region"`, keyboard Enter/Space.

```svelte
<Accordion>
  <AccordionItem title="What is Tessera?">
    <p>An LMS tracking runtime for interactive learning content.</p>
  </AccordionItem>
  <AccordionItem title="How do I start?">
    <p>Add pages in <code>pages/</code> and import components.</p>
  </AccordionItem>
</Accordion>
```

### Carousel / CarouselSlide

Slide-based viewer. A11y: `role="region"`, `aria-roledescription="carousel"`, arrow keys, mobile swipe.

```svelte
<Carousel>
  <CarouselSlide><h3>Step 1</h3><p>Plan.</p></CarouselSlide>
  <CarouselSlide><h3>Step 2</h3><p>Build.</p></CarouselSlide>
  <CarouselSlide><h3>Step 3</h3><p>Deploy.</p></CarouselSlide>
</Carousel>
```

### RevealModal

Modal triggered by user interaction. Uses Svelte 5 snippets for `trigger` and `content`. A11y: `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close.

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Modal label for screen readers |
| `trigger` | `snippet` | Click target that opens the modal |
| `content` | `snippet` | Modal body |

```svelte
<RevealModal title="Details">
  {#snippet trigger()}<button>More info</button>{/snippet}
  {#snippet content()}
    <h3>Additional Information</h3>
    <p>Press Escape or click outside to close.</p>
  {/snippet}
</RevealModal>
```

### Video

YouTube/Vimeo iframe (auto-detected, responsive 16:9) or native `<video>` for direct files. Lazy-loads on scroll.

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` | Video URL or `$assets/` path |
| `title` | `string` | Accessible label |

```svelte
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Intro" />
<Video src="$assets/demo.mp4" title="Demo" />
```

### Audio

Native player. A11y: `aria-label` from title.

```svelte
<Audio src="$assets/lecture-01.mp3" title="Lecture 1" />
```

---

## Quizzes

A quiz page is a normal page with `pageConfig.quiz` set. The runtime wraps the page in the resolved quiz shell (built-in `<Quiz>` by default; a project-supplied `quiz.svelte` if one exists at the project root) — page authors no longer need their own `<Quiz>` wrapper. Drop question components directly at the page root.

### Setup

```svelte
<script module>
  export const pageConfig = {
    title: "Module 1 Quiz",
    quiz: {
      graded: true,
      gatesProgress: false,
      maxAttempts: 3,
      showFeedback: true,
    },
  };
</script>

<script>
  import { MultipleChoice } from '@redmondd/tessera';
</script>

<MultipleChoice
  question="Which planet is closest to the Sun?"
  options={["Venus", "Mercury", "Earth", "Mars"]}
  correct={1}
/>
```

### Data contract — what the LMS sees

**Whatever quiz UI you build, the LMS sees the same `cmi.interactions` it would from the built-in.** Every question registered through `useQuestion` flows into one `tessera-quiz-complete` event on submit; the runtime forwards every `detail.interactions[]` entry to the persistence adapter. A custom quiz that bypasses `useQuiz().submit()` and dispatches its own event will silently fail to report — always go through the hook.

### `pageConfig.quiz` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `graded` | `boolean` | `false` | Whether the score counts toward course success |
| `gatesProgress` | `boolean` | `false` | Whether passing is required to access the next page |
| `maxAttempts` | `number` | `Infinity` | Max attempts |
| `showFeedback` | `boolean` | `true` | Show feedback after submission |
| `feedbackMode` | `"review" \| "immediate" \| (qIndex, attempt) => boolean` | `"review"` | Enum sugar or a predicate. `"immediate"` shows feedback after each answer; `"review"` after submit. Predicates have full control. |
| `retryMode` | `"full" \| "incorrect-only" \| (results) => Set<number>` | `"full"` | Enum sugar or a predicate that returns the set of question indices to lock as "already correct" on retry. |
| `canSubmit` | `(answered, total) => boolean` | all-answered | Custom Submit gate. Default requires every question to have an answer. |
| `score` | `(results) => number` | weighted-correct % | Returns 0–100. Default: `Σ(weight × correct) / Σ(weight) × 100`. With every weight = 1 (the default), this matches the unweighted mean. |

Enum sugar and predicate forms are equally first-class; pick whichever fits the course. `gatesProgress: true` blocks navigation to the next page until the learner passes. Works in both `free` and `sequential` navigation modes.

### Per-question weighting

Pass `weight` to `useQuestion` (and through built-in widget props) to change how much a question pulls on the page-level score. Defaults to 1.

```svelte
<MultipleChoice id="q-easy" weight={1} ... />
<MultipleChoice id="q-hard" weight={3} ... />
```

Weights apply identically inside a `<Quiz>` and to standalone questions on a plain page. Both paths roll up using `Σ(weight × score) / Σ(weight)` — the same widget answered the same way produces the same page score whether it's wrapped in a quiz or scattered across the page. Non-positive weights are treated as 1.

The LMS still sees each question as a single pass/fail interaction — weights only affect the page-level `cmi.core.score.raw` rollup, not `cmi.interactions.*`.

### Question types

#### MultipleChoice

| Prop | Type | Description |
|------|------|-------------|
| `question` | `string` | Prompt |
| `options` | `string[]` | Answer options |
| `correct` | `number` | Index of correct option (0-based) |
| `correctFeedback` | `string` | Optional |
| `incorrectFeedback` | `string` | Optional |
| `optionFeedback` | `string[]` | Optional per-option feedback |

```svelte
<MultipleChoice
  question="What is the capital of France?"
  options={["London", "Berlin", "Paris", "Madrid"]}
  correct={2}
/>
```

#### FillInTheBlank

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `question` | `string` | — | Prompt |
| `answers` | `string[]` | — | Acceptable answers |
| `caseSensitive` | `boolean` | `false` | Comparison casing |

`answers` only needs distinct spellings; `caseSensitive: false` already handles case variants.

```svelte
<FillInTheBlank
  question="What element has the symbol 'O'?"
  answers={["Oxygen"]}
/>
```

#### Matching

| Prop | Type | Description |
|------|------|-------------|
| `question` | `string` | Prompt |
| `pairs` | `{left: string, right: string}[]` | Correct pairs |

The right column is auto-shuffled. Click left then right to match (tap on mobile). Click a matched pair to unmatch. All pairs must be correct.

```svelte
<Matching
  question="Match country to capital:"
  pairs={[
    { left: "France", right: "Paris" },
    { left: "Germany", right: "Berlin" },
    { left: "Japan", right: "Tokyo" },
  ]}
/>
```

#### Sorting

Drag-and-drop (or click-to-place) into labelled categories.

| Prop | Type | Description |
|------|------|-------------|
| `question` | `string` | Prompt |
| `items` | `string[]` | Items to sort |
| `targets` | `string[]` | Category labels |
| `correct` | `number[]` | For each item, the index of its correct target (parallel array) |

```svelte
<Sorting
  question="Sort each animal:"
  items={["Dog", "Eagle", "Salmon", "Cat", "Robin", "Trout"]}
  targets={["Mammals", "Birds", "Fish"]}
  correct={[0, 1, 2, 0, 1, 2]}
/>
```

### Standalone questions

All four question components also work outside `<Quiz>` for inline practice. Standalone widgets render their own Check / Retry buttons.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `maxRetries` | `number` | `Infinity` | Max retries for standalone widgets |
| `weight` | `number` | `1` | Per-question weight for page-level rollup |

```svelte
<MultipleChoice
  question="What color is the sky on a clear day?"
  options={["Red", "Blue", "Green"]}
  correct={1}
  maxRetries={2}
/>
```

Standalone questions are not graded by default. To grade one (e.g., a required reflection that affects course success), build it with the `useQuestion` hook directly — see [Recipe 5](#recipe-5-graded-standalone-question).

---

## Assets

Drop files into `assets/`. Reference them with `$assets/` in component props:

```svelte
<Image src="$assets/photo.png" alt="Photo" />
<Video src="$assets/demo.mp4" title="Demo" />
<Audio src="$assets/lecture.mp3" title="Lecture" />
```

In CSS, use a relative path from `styles/`:

```css
.bg { background-image: url('../assets/bg.png'); }
```

External URLs work too: `<Image src="https://example.com/img.jpg" alt="..." />`.

---

## Styling

Add `.css` files to `styles/`. They load after framework styles and override them.

### CSS custom properties

Override these to theme globally:

| Property | Default |
|----------|---------|
| `--tessera-primary` | `#2563eb` |
| `--tessera-primary-light` | `#dbeafe` |
| `--tessera-primary-dark` | `#1e40af` |
| `--tessera-text` | `#1f2937` |
| `--tessera-text-light` | `#6b7280` |
| `--tessera-bg` | `#ffffff` |
| `--tessera-bg-secondary` | `#f9fafb` |
| `--tessera-border` | `#e5e7eb` |
| `--tessera-success` | `#16a34a` |
| `--tessera-error` | `#dc2626` |
| `--tessera-warning` | `#d97706` |
| `--tessera-font-family` | `'Inter', system-ui, sans-serif` |
| `--tessera-font-size-base` | `1rem` |
| `--tessera-line-height` | `1.6` |
| `--tessera-spacing-sm` / `-md` / `-lg` / `-xl` | `0.5rem` / `1rem` / `1.5rem` / `2rem` |
| `--tessera-sidebar-width` | `280px` |
| `--tessera-content-max-width` | `800px` |

```css
:root {
  --tessera-primary: #9333ea;
  --tessera-font-family: 'Georgia', serif;
}
```

`branding.primaryColor` and `branding.fontFamily` in `course.config.js` cover the common overrides without writing CSS.

---

## `course.config.js`

```js
export default {
  // Metadata
  title: "My Course",              // required
  description: "",
  author: "",
  version: "1.0.0",

  branding: {
    logo: "",                       // e.g., "$assets/logo.png"
    primaryColor: "#2563eb",
    fontFamily: "Inter, sans-serif",
  },

  navigation: {
    mode: "free",                   // "free" or "sequential"
  },

  completion: {
    mode: "percentage",             // "percentage" or "quiz"
    percentageThreshold: 100,       // 0–100 (percentage mode)
  },

  scoring: {
    passingScore: 70,
  },

  export: {
    standard: "web",                // "web" | "scorm12" | "scorm2004" | "cmi5"
  },
};
```

- `navigation.mode: "free"` → all pages accessible except those blocked by gating quizzes.
- `navigation.mode: "sequential"` → pages unlock one at a time as each is completed.
- `completion.mode: "percentage"` → course completes when `visitedPages / totalPages * 100 >= percentageThreshold`.
- `completion.mode: "quiz"` → course completes when graded quiz average >= `scoring.passingScore`.

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), supply `navigation.canAccess`. It runs synchronously on every navigation evaluation — keep it cheap.

```js
import { sequentialAccess } from '@redmondd/tessera';

export default {
  // ...
  navigation: {
    mode: 'sequential',
    canAccess: (ctx) => {
      if (!sequentialAccess(ctx)) return false;
      if (ctx.page.slug === 'lesson-5') {
        const i = ctx.manifest.pages.findIndex(p => p.slug === 'lesson-2-quiz');
        return (ctx.progress.quizScores.get(i) ?? 0) >= ctx.config.scoring.passingScore;
      }
      return true;
    },
  },
};
```

`AccessContext` exposes `pageIndex`, `page`, `manifest`, `progress`, and `config`. The presets `freeAccess` and `sequentialAccess` are re-exported from `@redmondd/tessera` for composition.

### LMS export and fail-loud behaviour

When `export.standard` is `"scorm12"`, `"scorm2004"`, or `"cmi5"`, the runtime selects the matching adapter at startup. **In production builds**, if the matching LMS API isn't reachable (no `API` / `API_1484_11` in the frame chain, no cmi5 launch parameters), the runtime throws `LMSAdapterError` and renders a visible "This course can't run here" panel — it does **not** silently fall back to localStorage. Use `export.standard: "web"` for any non-LMS testing or distribution.

In dev mode (`vite dev` / `npm run preview`), missing APIs warn to the console and fall back to `localStorage` so authors can iterate locally.

---

## Hooks Reference

The five hooks are the stable contract between widgets and the runtime.

```js
import {
  useQuestion,
  useQuiz,
  useNavigation,
  useProgress,
  usePersistence,
  isCorrect,
} from '@redmondd/tessera';
import type { Interaction } from '@redmondd/tessera';
```

Each hook is synchronous and must be called during component setup, inside a Tessera course. Calling them outside the runtime throws.

### `useQuestion`

Register a question widget so the runtime can submit, score, persist, and report it.

- **Inside `<Quiz>`** — the parent Quiz drives submission. The widget renders the prompt + answer UI; nothing else.
- **Standalone** — the widget owns its own Check/Retry. Set `graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string;                   // unique on the page; LMS interaction id
  graded?: boolean;             // standalone only
  response: () => Interaction;  // current learner answer; called on submit
  score?: () => number;         // standalone-only override (0–100)
  weight?: number;              // page-level rollup weight (default 1)
  reset?: () => void;
}): {
  submit(): void;
  reset(): void;
  readonly submitted: boolean;
  readonly correct: boolean | null;
  readonly mode: 'standalone' | 'quiz';
  readonly quizIndex: number | undefined;
};
```

`Interaction` follows SCORM 2004 4th Edition vocabulary verbatim: `choice`, `true-false`, `fill-in`, `long-fill-in`, `matching`, `sequencing`, `numeric`, `likert`, `performance`, `other`. Each is `{ type, response, correct? }`. Omit `correct` if the runtime should not auto-judge — `useQuestion` reports a `null` correctness flag and your widget renders its own UI.

```svelte
<script>
  import { useQuestion } from '@redmondd/tessera';

  let order = $state(['Mercury', 'Venus', 'Earth', 'Mars']);

  const q = useQuestion({
    id: 'planet-rank',
    response: () => ({
      type: 'sequencing',
      response: order,
      correct: ['Mercury', 'Venus', 'Earth', 'Mars'],
    }),
    reset: () => { order = ['Mercury', 'Venus', 'Earth', 'Mars']; },
  });
</script>

<!-- drag-to-reorder UI bound to `order` -->
{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
{/if}
```

### `useQuiz`

Public quiz orchestration hook. The built-in `<Quiz>` and any project-supplied `quiz.svelte` both run on this. Authors writing a custom quiz shell call `useQuiz` to drive submission/retry/review and dispatch the load-bearing `tessera-quiz-complete` event.

```ts
function useQuiz(opts: {
  /** Getter for the host DOM element from which `tessera-quiz-complete` is dispatched. */
  element: () => HTMLElement | null;
}): {
  /** Question widgets register here; `useQuestion` does this for the built-ins. */
  registerQuestion(api: {
    id: string;
    weight?: number;
    checkAnswer: () => boolean;
    reset?: () => void;
    interaction: () => Interaction;
  }): number;
  setRender(index: number, render: unknown): void;
  setAnswer(index: number, answer: unknown): void;
  /** Computes results, advances state, and dispatches `tessera-quiz-complete`.
   * The runtime forwards every `detail.interactions[]` entry to the LMS
   * adapter — bypassing this means the quiz reports nothing. */
  submit(): void;
  retry(): void;
  startReview(): void;
  exitReview(): void;
  /** Reveal feedback for a single question (immediate-feedback flow). */
  revealFeedback(index: number): void;
  getAnswer(index: number): unknown;
  getRender(index: number): unknown;
  feedbackVisible(index: number): boolean;
  isLockedCorrect(index: number): boolean;
  readonly questions: ReadonlyArray<{ id: string; submitted: boolean; correct: boolean | null }>;
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly score: number;
  readonly attemptCount: number;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
};
```

Throws when called on a page that has no `pageConfig.quiz`. Dispatches three additional DOM events alongside `tessera-quiz-complete` for telemetry: `tessera-quiz-question-answered`, `tessera-quiz-before-submit`, and `tessera-quiz-retry`. None of those trigger an adapter write.

### `useNavigation`

```ts
function useNavigation(): {
  readonly currentPage: ManifestPage;
  readonly currentPageIndex: number;
  readonly pages: ManifestPage[];
  goTo(slug: string): void;
  goToIndex(index: number): void;
  next(): void;
  prev(): void;
  readonly canGoNext: boolean;
  readonly canGoPrev: boolean;
  canAccess(slug: string): boolean;
};
```

### `useProgress`

```ts
function useProgress(): {
  readonly visitedPages: Set<number>;
  readonly quizScores: Map<number, number>;            // pageIndex → score 0–100
  readonly chunkProgress: Map<number, number>;         // pageIndex → highest revealed chunk index
  readonly completionStatus: 'incomplete' | 'complete';
  readonly successStatus: 'unknown' | 'passed' | 'failed';
  markVisited(pageIndex: number): void;
  markChunk(pageIndex: number, chunkIndex: number): void;
};
```

### `usePersistence<T>(key)`

Per-widget persistent state. Survives reload on every adapter — `localStorage` for web, SCORM `cmi.suspend_data` for SCORM 1.2/2004, xAPI State API for cmi5. Reads sync; writes batched by the adapter. JSON-serializable values only.

```ts
function usePersistence<T>(key: string): {
  get(): T | null;
  set(value: T): void;
};
```

```svelte
<script>
  import { usePersistence } from '@redmondd/tessera';

  const store = usePersistence('whiteboard');
  let state = $state(store.get() ?? { strokes: [] });
  $effect(() => store.set(state));
</script>
```

### `isCorrect(interaction)`

Pure helper. Returns `true`, `false`, or `null` (when the interaction has no `correct` field).

```ts
function isCorrect(i: Interaction): boolean | null;
```

---

## Custom xAPI statements

Tessera's lifecycle stream (Initialized / Completed / Passed / Failed / Terminated under cmi5; `cmi.*` writes under SCORM) is sent automatically by the runtime. To emit your own xAPI verbs (e.g. `experienced`, `interacted`, a domain-specific verb for analytics), use `useXAPI()`:

```ts
import { useXAPI } from '@redmondd/tessera';

const xapi = useXAPI();             // XAPIClient | null
xapi?.sendStatement({
  verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
  object: { id: `${xapi.getActivityId()}#diagram-1` },
});
```

`useXAPI()` is **not a Svelte context hook** — it is a plain function callable from anywhere: a `.svelte` component setup block, an event handler, an async callback, a `setTimeout`, a plain `.ts` module imported by author code. It returns `null` when no LRS is configured or when called before App.svelte's adapter init has resolved; author code should null-check and degrade gracefully.

The publisher fills in: `actor`, `timestamp`, `id` (UUID), `context.contextActivities.grouping`, `context.registration` (cmi5 only), and the cmi5 sessionid extension (cmi5 only). You supply: `verb`, `object` (defaults to the activity), and optionally `result`, `context`, and `attachments`.

### Configure the destination — `course.config.js`

The custom stream is configured via `config.xapi`. There is no "default to the cmi5 launch LRS" magic — author always declares the destination explicitly.

```js
// Explicit LRS, works under any export mode:
export default {
  export: { standard: 'web' },     // or scorm12 / scorm2004 / cmi5
  xapi: {
    endpoint: 'https://lrs.example.com/xapi/',
    auth: () => fetch('/api/lrs-token').then(r => r.text()),
    actor: () => getCurrentUser(),     // or a static Agent object
    activityId: 'https://example.com/courses/intro-to-x',
  },
};
```

Under cmi5 you can inherit the LMS launch-supplied LRS:

```js
xapi: { endpoint: 'lms' }    // cmi5 only — inherits endpoint+auth+actor+activityId+registration
```

Fan out to multiple LRSes by passing an array. At most one entry may use `endpoint: 'lms'`:

```js
xapi: [
  { endpoint: 'lms' },                                              // cmi5 launch LRS
  { endpoint: 'https://analytics.example.com/xapi/',
    auth: () => fetch('/api/analytics-token').then(r => r.text()),
    actor: () => getCurrentUser(),
    activityId: 'https://example.com/courses/intro-to-x' },
]
```

Each destination has its own queue, auth resolver, and retry loop. One UUID is minted per `sendStatement` and reused across destinations so all LRSes see the same statement id (idempotent dedupe works).

### Per-mode behaviour

| Mode | `xapi` not set | `xapi.endpoint: 'lms'` | `xapi: {endpoint, ...}` (explicit) |
|------|---------------|------------------------|-----------------------------------|
| **cmi5** | `useXAPI()` → null | Inherits launch LRS; shares queue with lifecycle stream | Independent publisher; `actor` defaults to launch actor |
| **scorm12** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` derived from `cmi.learner_id` |
| **web** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` **required** in config |

### Actor resolution

Priority order (top wins):

1. **Author-supplied `xapi.actor`** — always wins.
2. **cmi5 launch actor** — under cmi5, the publisher uses the same Agent the LMS handed us at launch.
3. **SCORM-derived actor** — under scorm12/scorm2004, the publisher synthesizes:
   ```ts
   {
     account: {
       homePage: xapi.actorAccountHomePage ?? originOf(xapi.activityId),
       name:     <cmi.core.student_id | cmi.learner_id>,
     },
     name:       <cmi.core.student_name | cmi.learner_name>,
     objectType: 'Agent',
   }
   ```
   The `account` IFI satisfies xAPI's Identified Agent rule. `homePage` defaults to the activityId origin; override via `actorAccountHomePage` if your authority namespace is elsewhere. Required if `activityId` is a non-URL IRI.
4. **Fallback: error.** Web export with no `actor` fails at config time.

Mid-session identity change (e.g., learner logs in/out without reloading) is **not supported in v1** — actor is resolved once per page-load and cached. Reload the runtime on identity change.

### Auth

v1 supports **Basic auth only**. The publisher prepends `Basic ` to whatever your `auth` value resolves to — pass the credential value, not the full header.

For OAuth-protected LRSes, wrap the token exchange in your `auth` function and return a Basic credential the LRS accepts (or run a thin proxy that converts).

The function form is re-invoked once on a 401 to cover short-lived tokens that have just expired. Two consecutive 401s mark the auth resolver dead for the publisher's lifetime — every subsequent send fails fast without hitting the LRS. Reload the runtime to retry.

**Static-string `auth` ships in your bundle** — fine for demos, never for production. Use a function that fetches a server-brokered short-lived token instead.

### Retry policy

- **Default:** 3 attempts with exponential backoff (100ms, 200ms, 400ms).
- **5xx / network errors** retry. **4xx** short-circuits — retrying won't help.
- **HTTP 409 Conflict** is treated as **success** (xAPI rejects POSTs with a duplicate statement id, so a 409 on retry means the LRS already accepted the statement).
- **Per-statement opt-out:** `sendStatement(stmt, { retry: false })` for fire-and-forget telemetry where the author would rather drop than block.

### `sendStatement` return shape

```ts
const result = await xapi.sendStatement({ verb, object });
// result: {
//   statementId: string,
//   statement: Statement,           // fully resolved: actor, context, timestamp filled in
//   destinations: [{ endpoint, ok, status?, error? }, ...]
// }
```

`destinations[]` lets you act on partial failures under fan-out — one LRS can be down without affecting the others.

### Validation

The publisher checks three things before sending:

1. `verb.id` — present, non-empty string.
2. `object.id` — non-empty string when `object` is supplied.
3. `result.score.scaled` — number in `[-1, 1]` when supplied.

Everything else passes through. The LRS gives clearer errors for IRI / extension / attachment shape issues than we can; failures surface via `destinations[].error`.

### Examples by mode

```ts
// In a .svelte component
const xapi = useXAPI();
xapi?.sendStatement({
  verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
  object: { id: `${xapi.getActivityId()}#diagram-1` },
});

// In an event handler
function onClick() {
  useXAPI()?.sendStatement({
    verb: { id: 'http://adlnet.gov/expapi/verbs/interacted' },
    object: { id: 'https://example.com/courses/intro-to-x#diagram-1' },
  });
}

// In a plain .ts helper module
export async function reportMilestone(name: string) {
  await useXAPI()?.sendStatement({
    verb: { id: 'https://example.com/verbs/reached' },
    object: { id: `https://example.com/milestones/${name}` },
  });
}
```

### Mode-specific caveats

**SCORM (1.2 / 2004):**
- Actor identity is auto-derived. Authors who want a different IFI shape (`mbox`, `openid`) supply `actor` explicitly.
- **CORS.** The LRS must allow the LMS-served origin. Many don't by default. Most painful under SCORM where the SCO runs inside the LMS iframe.
- No sessionid linkage to anything LMS-side. Want to group statements by session? Attach your own extension under your own IRI.
- Running locally without an LMS API (the dev WebAdapter fallback), an explicit xapi destination with no author actor cannot synthesize an Agent — `sendStatement` rejects with an explicit error naming the missing data-model field. For dev work, supply `xapi.actor` explicitly or launch from SCORM Cloud.

**Web:**
- The course bundle is **public**. Static `auth: 'Basic abc123'` in config leaks credentials. Always use a function that fetches a server-brokered token endpoint.
- **CORS** matters here too — the token endpoint is typically cross-origin from the bundle host.
- Three actor patterns to choose from:
  1. Hardcoded anonymous actor for demos.
  2. Author-wired auth → `actor: () => getCurrentUser()`.
  3. Query-string `?actor=...` mirroring cmi5 launch convention.

**cmi5 with `endpoint: 'lms'`:**
- Author and adapter share **one publisher instance and one queue**, so ordering is preserved (no race between an author's `experienced` statement and the adapter's `Completed`).
- Running locally without cmi5 launch params, `sendStatement` rejects with an explicit error naming the missing params — there is **no silent dev fallback**. For dev work, point `endpoint` at a local LRS instead.

**Page unload (cmi5 §9.3.6):** once the page begins unloading, the runtime marks every publisher unloading and `useXAPI()?.sendStatement(...)` calls (e.g. from a `beforeunload` handler) reject with an explicit error. This keeps the cmi5 Terminated statement last on the wire — at unload time the session is closing and the spec wins. Anything you need to record at the very end belongs in `onDestroy` of a child component, not in `beforeunload`.

### Non-goals (v1)

- Bearer / OAuth credentials at the publisher level (wrap in your `auth` function).
- Statement signing / attachments helpers (the publisher accepts attachments but doesn't help build them).
- Offline queue / IndexedDB durability.
- LRS State API access for non-cmi5 modes.
- Voiding statements.
- Mid-session actor refresh (`refreshActor()`).
- Group actors (Agent only).

---

## Custom Layouts

Drop `layout.svelte` at the project root to replace the default sidebar/topbar/prev-next chrome. The runtime uses it whenever it exists.

The contract: the file receives a single `page` snippet prop and renders it where the active page should appear. Use the hooks for everything else.

```svelte
<!-- layout.svelte -->
<script>
  import { useNavigation, useProgress } from '@redmondd/tessera';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<header>
  <h1>{nav.currentPage.title}</h1>
  <span>{progress.visitedPages.size} / {nav.pages.length} visited</span>
</header>

<main>{@render page()}</main>

<footer>
  <button disabled={!nav.canGoPrev} onclick={() => nav.prev()}>Prev</button>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next</button>
</footer>
```

To keep most of the default chrome and swap one piece, import `DefaultLayout` from `@redmondd/tessera` and compose around it.

---

## Cookbook

End-to-end recipes that exercise the full hooks API. Adapt to taste.

### Recipe 1: Custom "draw a line" question

Learner connects a left-side label to a right-side label by drawing a line. Emits a `matching` interaction so the runtime scores it identically to `<Matching>`. Persists partial progress so an interrupted session resumes cleanly.

```svelte
<!-- pages/05-pairs/01-pairs/draw-pairs.svelte -->
<script module>
  export const pageConfig = { title: "Match the elements" };
</script>

<script>
  import { useQuestion, usePersistence } from '@redmondd/tessera';

  const store = usePersistence('draw-pairs:v1');
  let pairs = $state(store.get() ?? []);
  $effect(() => store.set(pairs));

  const q = useQuestion({
    id: 'draw-pairs-1',
    response: () => ({
      type: 'matching',
      response: pairs,
      correct: [['Hydrogen', 'H'], ['Helium', 'He'], ['Lithium', 'Li']],
    }),
    reset: () => { pairs = []; },
  });

  function connect(l, r) {
    pairs = [...pairs.filter(([a]) => a !== l), [l, r]];
  }
</script>

<svg width="400" height="200" role="img" aria-label="Drag to match elements to their symbols">
  <!-- canvas + line-drawing UI calls connect(l, r) on drop -->
</svg>

{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
  {#if q.correct === true}<p>Correct.</p>{/if}
  {#if q.correct === false}<button onclick={() => q.reset()}>Try again</button>{/if}
{/if}
```

### Recipe 2: Custom topbar layout

Replace the default sidebar with a horizontal topbar showing breadcrumb + progress %. Drop `layout.svelte` at the project root; no other changes needed.

```svelte
<!-- layout.svelte -->
<script>
  import { useNavigation, useProgress } from '@redmondd/tessera';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();

  const percent = $derived(
    Math.round((progress.visitedPages.size / nav.pages.length) * 100)
  );
</script>

<header class="topbar">
  <span class="brand">My Course</span>
  <span class="crumb">{nav.currentPage.section} › {nav.currentPage.title}</span>
  <span class="progress" aria-live="polite">{percent}% complete</span>
</header>

<main class="content">{@render page()}</main>

<nav class="footer">
  <button disabled={!nav.canGoPrev} onclick={() => nav.prev()}>← Back</button>
  <select onchange={(e) => nav.goTo(e.currentTarget.value)} value={nav.currentPage.slug}>
    {#each nav.pages as p}<option value={p.slug}>{p.title}</option>{/each}
  </select>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next →</button>
</nav>

<style>
  .topbar { display: flex; gap: 1rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--tessera-border); }
  .content { max-width: var(--tessera-content-max-width); margin: 0 auto; padding: 2rem; }
  .footer { display: flex; gap: 1rem; padding: 1rem 1.5rem; border-top: 1px solid var(--tessera-border); }
</style>
```

### Recipe 3: Prerequisite-based access

Lock lesson 5 until lessons 1–3 are visited. Composes with `sequentialAccess` instead of re-implementing it.

```js
// course.config.js
import { sequentialAccess } from '@redmondd/tessera';

const PREREQS = ['lesson-1', 'lesson-2', 'lesson-3'];

export default {
  title: 'My Course',
  navigation: {
    mode: 'sequential',
    canAccess: (ctx) => {
      if (!sequentialAccess(ctx)) return false;
      if (ctx.page.slug !== 'lesson-5') return true;
      return PREREQS.every((slug) => {
        const i = ctx.manifest.pages.findIndex((p) => p.slug === slug);
        return i >= 0 && ctx.progress.visitedPages.has(i);
      });
    },
  },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: 'web' },
};
```

### Recipe 4: Custom quiz shell via `quiz.svelte`

Drop `quiz.svelte` at the project root to replace the built-in `<Quiz>`. The runtime wraps every page with `pageConfig.quiz` in your shell instead of the carousel default. The shell uses only the public `useQuiz()` API — no imports from `tessera/runtime/*`.

```svelte
<!-- quiz.svelte -->
<script>
  import { useQuiz } from '@redmondd/tessera';

  let { children } = $props();
  let host;

  // useQuiz owns submission, retry, review, score, and dispatching
  // tessera-quiz-complete. The shell only drives the UI on top of it.
  const quiz = useQuiz({ element: () => host });
</script>

<div bind:this={host} class="my-quiz">
  <p>Question {quiz.questions.findIndex((q) => !q.submitted) + 1} of {quiz.questions.length}</p>

  {#each quiz.questions as q, i}
    {@const renderFn = quiz.getRender(i)}
    <section data-question-id={q.id}>{#if renderFn}{@render renderFn()}{/if}</section>
  {/each}

  {#if quiz.state === 'answering'}
    <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}>Submit</button>
  {:else if quiz.state === 'submitted'}
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    <button onclick={() => quiz.startReview()}>Review</button>
  {/if}

  <!-- Children render hidden so widget state survives submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

**The data contract is the same.** The LMS sees the exact `cmi.interactions` it would from the built-in — `useQuiz().submit()` is the only sanctioned dispatcher of `tessera-quiz-complete`, so a custom shell that goes through it reports identically. A custom shell that builds its own submit flow without going through the hook will report nothing — the built-in compliance harness in the package's test suite prevents that drift inside the framework, but author-side regressions are not protected. Always submit through the hook.

### Recipe 5: Graded standalone question

A single inline reflection — not in a `<Quiz>` but `graded: true`, so it counts toward course success. Useful for "must answer to pass" gates without the quiz wrapper.

```svelte
<!-- pages/04-reflection/01-reflect/reflect.svelte -->
<script module>
  export const pageConfig = { title: "Reflection" };
</script>

<script>
  import { useQuestion } from '@redmondd/tessera';

  let answer = $state('');

  const q = useQuestion({
    id: 'why-it-matters',
    graded: true,
    response: () => ({
      type: 'long-fill-in',
      response: answer,
      // No `correct` — any answer accepted; we just want completion.
    }),
    score: () => answer.trim().length >= 50 ? 100 : 0,
    reset: () => { answer = ''; },
  });
</script>

<h1>Why does this matter to you?</h1>
<p>At least 50 characters required to pass.</p>

<textarea bind:value={answer} rows="6" disabled={q.submitted}></textarea>
<button onclick={() => q.submit()} disabled={q.submitted || answer.trim().length < 50}>
  Submit
</button>

{#if q.submitted}<p>Thanks — your reflection has been recorded.</p>{/if}
```

The LMS sees a graded `long-fill-in` interaction. Course success rolls up across all graded items — quizzes and standalones alike.

---

## Constraints

- **No runtime data fetching.** Page content is static — no `fetch()` or dynamic loaders in page components.
- **Use the hooks.** Import `useQuestion` / `useNavigation` / `useProgress` / `usePersistence` from `@redmondd/tessera`. Do **not** import from `@redmondd/tessera/runtime/*` — those paths are internal and may change.
- **Static `pageConfig` only.** Plain object literal with static values. No variables, function calls, template literals, or computed values. JSON5-compatible syntax (trailing commas, unquoted keys, single quotes are fine).
- **Module-script form.** `<script module>` (Svelte 5) or `<script context="module">` (legacy) both work; the manifest parser accepts either.
- **Third-party libraries** must be added as project dependencies in `package.json`.
- **`$assets/` alias** works in JavaScript / Svelte component props only. In CSS, use relative paths from `styles/`.
