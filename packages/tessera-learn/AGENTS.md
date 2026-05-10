# AGENTS.md: Tessera Course Authoring Guide

Tessera is an **LMS tracking runtime** for interactive learning content. It handles SCORM 1.2 / SCORM 2004 / cmi5 / xAPI statements, progress state, completion and success rollup, persistence, and navigation gating, and gets out of the way for the presentation layer.

**Lock the data contract. Free the presentation.** Build a course with built-in components, your own (via the hooks), or any mix. This file is the canonical reference for any agent or human author working in a Tessera project. Read it before generating or editing course code.

---

## Running the project

From the project root:

```bash
npm install            # first time only
npm run preview        # dev server at http://localhost:5173 (Ctrl+C to stop)
npm run export         # build + package for the LMS standard configured in course.config.js
```

The dev server hot-reloads as you edit pages, layouts, components, and `course.config.js`. The `export` command produces a SCORM 1.2, SCORM 2004, cmi5, or static-web bundle depending on `course.config.js`.

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
├── AGENTS.md                  # This file (written by the scaffolder)
└── pages/
    └── 01-intro/              # Numeric prefix → controls order
        ├── _meta.js           # Override section title; control page order
        ├── welcome.svelte     # Page directly in the section ("flat" shape)
        └── 01-getting-started/  # Lesson subdirectory ("nested" shape)
            ├── _meta.js
            └── overview.svelte
```

### Hierarchy and ordering

The manifest is always **section → lesson → page**. Files directly in a section folder are flattened into one implicit lesson with the section's title; lesson subdirectories nest as expected. Both shapes can coexist.

Sorting is alphabetical by directory / filename. Numeric prefixes on directories (`01-`, `02-`, …) give explicit ordering without renaming the files inside, and are stripped from slugs and titles (`01-getting-started/` → slug `getting-started`, title "Getting Started"). Use `_meta.js` to control page order within a lesson rather than prefixing page filenames.

### `_meta.js` files

**Optional everywhere.** When absent, titles fall back to the title-cased slug.

```js
// section or lesson _meta.js: title override
export default { title: "Getting Started" };
```

```js
// lesson _meta.js: explicit page order
export default {
  title: "Welcome",
  pages: ["welcome", "objectives"],
};
```

Pages listed in `pages` come first in listed order; any unlisted `.svelte` files are appended alphabetically.

---

## Authoring Surfaces

There are five:

1. **Built-in components**: `Callout`, `Image`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, etc., from `tessera-learn`. Use, compose, or skip.
2. **Hooks**: `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `usePersistence`. The stable contract between custom widgets and the runtime. Anything the built-ins do, you can do.
3. **Custom layout**: drop `layout.svelte` at the project root to replace the default chrome.
4. **Custom quiz shell**: drop `quiz.svelte` at the project root to replace the built-in quiz UI for every page that has `pageConfig.quiz`. Authors call `useQuiz()` for state and dispatch; question widgets continue to register through `useQuestion`.
5. **Custom xAPI**: `useXAPI()` returns a publisher for emitting your own xAPI verbs to one or more LRSes. See [Custom xAPI statements](#custom-xapi-statements).

The built-ins are reference implementations of the hooks. A custom widget that calls `useQuestion` and emits an `Interaction` is treated identically to `<MultipleChoice>`, with the same scoring, LMS reporting, and persistence.

---

## Creating Pages

Each page is a `.svelte` file inside a lesson folder.

### Basic page

```svelte
<h1>Welcome</h1>
<p>Standard HTML works as-is.</p>
```

### Page configuration

`pageConfig` sets the page title and configures quizzes. It must be a **static object literal** in a module script block. No variables, function calls, or computed values.

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
  import { Callout, Image } from 'tessera-learn';
</script>

<Callout type="info">
  <p>Helpful information.</p>
</Callout>
```

---

## Component Reference

All components import from `tessera-learn`. Nothing is loaded automatically; import only what you use.

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

A quiz page is a normal page with `pageConfig.quiz` set. The runtime wraps the page in the resolved quiz shell (built-in `<Quiz>` by default; a project-supplied `quiz.svelte` if one exists at the project root). Page authors no longer need their own `<Quiz>` wrapper. Drop question components directly at the page root.

### Setup

```svelte
<script module>
  export const pageConfig = {
    title: "Module 1 Quiz",
    quiz: { graded: true, maxAttempts: 3 },
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
</script>

<MultipleChoice
  question="Which planet is closest to the Sun?"
  options={["Venus", "Mercury", "Earth", "Mars"]}
  correct={1}
/>
```

### Data contract: what the LMS sees

Whatever quiz UI you build, the LMS sees the same `cmi.interactions` it would from the built-in: every question registered through `useQuestion` flows through `useQuiz().submit()` → `tessera-quiz-complete` → the persistence adapter. Bypass the hook and the quiz reports nothing.

### `pageConfig.quiz` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `graded` | `boolean` | `false` | Whether the score counts toward course success |
| `gatesProgress` | `boolean` | `false` | Whether passing is required to access the next page |
| `maxAttempts` | `number` | `Infinity` | Max attempts |
| `showFeedback` | `boolean` | `true` | Master gate. When `false`, feedback never renders regardless of `feedbackMode`. |
| `feedbackMode` | `"review" \| "immediate" \| (qIndex, attempt) => boolean` | `"review"` | When feedback renders (only consulted if `showFeedback` is true). `"immediate"` shows feedback after each answer; `"review"` after submit. Predicates have full control. |
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

Weights apply identically inside a `<Quiz>` and to standalone questions on a plain page. Both paths roll up using `Σ(weight × score) / Σ(weight)`. The same widget answered the same way produces the same page score whether it's wrapped in a quiz or scattered across the page. Non-positive weights are treated as 1.

The LMS still sees each question as a single pass/fail interaction; weights only affect the page-level `cmi.core.score.raw` rollup, not `cmi.interactions.*`.

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
| `weight` | `number` | Page-level rollup weight (default `1`). See [Per-question weighting](#per-question-weighting). |

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
| `question` | `string` |  | Prompt |
| `answers` | `string[]` |  | Acceptable answers |
| `caseSensitive` | `boolean` | `false` | Comparison casing |
| `weight` | `number` | `1` | Page-level rollup weight |

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
| `weight` | `number` | Page-level rollup weight (default `1`) |

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
| `weight` | `number` | Page-level rollup weight (default `1`) |

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

Standalone questions are not graded by default. To grade one (e.g., a required reflection that affects course success), build it with the `useQuestion` hook directly. See [Recipe 5](#recipe-5-graded-standalone-question).

---

## Manual completion

`completion.mode: "manual"` is for courses where the author — not a quiz score or a page-visit ratio — owns the moment of completion. Two examples:

- A short policy briefing where reading the final page **is** the proof of completion.
- A compliance "click to acknowledge" button at the end of a module.

Under manual mode, **both** triggers below are always active. First-to-fire wins; subsequent calls are idempotent.

### Trigger A: page frontmatter

Declare `completesOn: "view"` on any page. Completion fires the moment that page renders.

```svelte
<!-- pages/05-summary/finale.svelte -->
<script module>
  export const pageConfig = {
    title: "You're done",
    completesOn: "view",
  };
</script>

<h1>Thanks for completing the briefing.</h1>
```

`completesOn` accepts the literal string `"view"` (only value in v1). The page is marked visited and completion fires in the same effect — the LMS sees one `setCompletionStatus("complete")` immediately after the page renders.

### Trigger B: runtime hook

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

{#if completionStatus === 'complete'}
  <p>Recorded. You may now close this window.</p>
{/if}
```

Composes cleanly with custom widgets, modal close handlers, video-ended events, timer expirations, etc. Calling `markComplete()` outside `completion.mode: "manual"` is a no-op with a one-shot dev warning per session — safe to leave in shared components.

### `completion.trigger` (build-time check)

Optional. Set to `"page"` to fail the build when no page declares `completesOn: "view"`. Useful when the page-view path is load-bearing and a typo should fail the build, not the launch. Both triggers still work either way; the field only adds a static check.

```js
completion: { mode: "manual", trigger: "page" }
```

When omitted, the dev runtime warns once after 60 s if completion has not fired — a safety net that covers both "no `completesOn` page exists" and "the hook is never called" cases.

### Success status

By default `successStatus` stays `"unknown"` under manual — the LMS sees completion without a pass/fail verdict. If you want completion **and** an automatic pass (typical for "acknowledge" flows):

```js
completion: { mode: "manual", requireSuccessStatus: "passed" }  // or "failed"
```

| Adapter        | What the LMS sees on `markComplete()` (no `requireSuccessStatus`)  |
| -------------- | ------------------------------------------------------------------ |
| SCORM 1.2      | `cmi.core.lesson_status = "completed"`                             |
| SCORM 2004 4th | `cmi.completion_status = "completed"`, `cmi.success_status = "unknown"` |
| cmi5           | **Completed** statement (no Passed / Failed)                       |
| web            | `localStorage` only                                                |

With `requireSuccessStatus: "passed"`, SCORM 1.2 writes `lesson_status = "passed"`, SCORM 2004 writes `success_status = "passed"`, and cmi5 emits a **Passed** statement alongside **Completed**.

### Quizzes under manual mode

A graded quiz under `mode: "manual"` reports its score to the LMS gradebook but does **not** drive completion or success — `markComplete()` / `completesOn` does. The build emits a warning to make this explicit. Set `graded: false` (or remove the quiz) if that's not what you want.

### Non-goals

- Combining manual + quiz/percentage rules ("complete when X **and** quiz passed"). Use a `useCompletion()` call inside a custom `$effect` if you need conditional logic.
- Per-learner conditional completion expressed in config — same answer: do it in a component with `useCompletion()`.
- Marking a course **incomplete** after it has been completed. Completion is monotonic in every spec we target. The runtime ignores re-marks.

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

At build time the plugin copies `assets/` into `dist/assets/` so `$assets/foo.png` resolves the same way in the shipped bundle as it does in the dev server.

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
    mode: "percentage",             // "percentage" | "quiz" | "manual"
    percentageThreshold: 100,       // 0–100 (percentage mode)
    // trigger: "page",              // (manual only) opt into build-time check
    // requireSuccessStatus: "passed", // (manual only) "passed" | "failed"
  },

  scoring: {
    passingScore: 70,               // optional under "manual" (defaults to 0)
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
- `completion.mode: "manual"` → course completes when an author-declared trigger fires: a page declares `pageConfig.completesOn: "view"`, or any component calls `useCompletion().markComplete()`. First-to-fire wins. `scoring.passingScore` is optional (defaults to 0). See [Manual completion](#manual-completion).

### Minimum config

Every field except `title` has a default. The build merges yours over:

```js
// effective defaults
{
  title: "Untitled Course",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
}
```

So `export default { title: "My Course" }` is a complete config: free navigation, full-percentage completion, web export.

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), supply `navigation.canAccess`. It runs synchronously on every navigation evaluation. Keep it cheap.

```js
import { sequentialAccess } from 'tessera-learn';

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

`AccessContext` exposes `pageIndex`, `page`, `manifest`, `progress`, and `config`. The presets `freeAccess` and `sequentialAccess` are re-exported from `tessera-learn` for composition. `resolveAccess(config)` is also exported. It returns the predicate the runtime would use (custom `canAccess` if set, otherwise the matching preset). Useful when you want to wrap rather than replace.

### Build output

`npm run export` (which wraps `vite build`) writes:

| `export.standard` | What ships | Where |
|-------------------|------------|-------|
| `web` | Static site (HTML/CSS/JS + `assets/`) | `dist/` (host on any static file server) |
| `scorm12` | SCORM 1.2 package | `dist/<course>-scorm12.zip` |
| `scorm2004` | SCORM 2004 4th Edition package | `dist/<course>-scorm2004.zip` |
| `cmi5` | cmi5 package (AU + manifest) | `dist/<course>-cmi5.zip` |

For LMS exports, upload the zip via your LMS's import flow. For web export, the bundle is a self-contained static site. Drop `dist/` on Netlify, GitHub Pages, S3, or any static host.

### Validation

The Vite plugin runs project validation on every dev start and build (manifest shape, `pageConfig` parseability, asset references, etc.). Errors abort the build and print as `[tessera error] ...`; warnings print as `[tessera warning] ...` and don't block. The npm scripts in a scaffolded project are `npm run preview` (wraps `vite dev`, local dev server with HMR) and `npm run export` (wraps `vite build`, full validation + bundle + adapter packaging). Names diverge from Vite's defaults because they describe the authoring intent ("preview the course", "export for an LMS") rather than the underlying tool.

---

## Hooks Reference

Five hooks plus one helper make up the stable contract between widgets and the runtime.

```js
import {
  useQuestion,
  useQuiz,
  useNavigation,
  useProgress,
  usePersistence,
  isCorrect,
} from 'tessera-learn';
import type { Interaction } from 'tessera-learn';
```

Each hook is synchronous and must be called during component setup, inside a Tessera course. Calling them outside the runtime throws.

### `useQuestion`

Register a question widget so the runtime can submit, score, persist, and report it.

- **Inside `<Quiz>`**: the parent Quiz drives submission. The widget renders the prompt + answer UI; nothing else.
- **Standalone**: the widget owns its own Check/Retry. Set `graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string;                   // unique on the page; LMS interaction id
  graded?: boolean;             // standalone only
  response: () => Interaction;  // current learner answer; called on submit
  score?: () => number;         // standalone-only override (0–100)
  weight?: number;              // page-level rollup weight (default 1)
  maxRetries?: number;          // standalone retry cap (default Infinity); ignored inside <Quiz>
  reset?: () => void;
}): {
  submit(): void;
  reset(): void;
  retry(): void;                // standalone-only; no-op once maxRetries hit or inside <Quiz>
  readonly submitted: boolean;
  readonly correct: boolean | null;
  readonly canRetry: boolean;
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  readonly quizIndex: number | undefined;
};
```

`Interaction` follows SCORM 2004 4th Edition vocabulary verbatim: `choice`, `true-false`, `fill-in`, `long-fill-in`, `matching`, `sequencing`, `numeric`, `likert`, `performance`, `other`. Each is `{ type, response, correct? }`. Omit `correct` if the runtime should not auto-judge; `useQuestion` reports a `null` correctness flag and your widget renders its own UI.

```svelte
<script>
  import { useQuestion } from 'tessera-learn';

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

Quiz orchestration hook used by both the built-in `<Quiz>` and any project-supplied `quiz.svelte`. A custom shell calls `useQuiz` to drive submission/retry/review; **`submit()` is the only sanctioned dispatcher of `tessera-quiz-complete`**: bypassing it means the quiz reports nothing to the LMS.

```ts
function useQuiz(opts: { element: () => HTMLElement | null }): {
  registerQuestion(api: {
    id: string;
    weight?: number;
    checkAnswer: () => boolean;
    reset?: () => void;
    interaction: () => Interaction;
  }): number;
  setRender(index: number, render: unknown): void;
  setAnswer(index: number, answer: unknown): void;
  submit(): void;        // dispatches tessera-quiz-complete; runtime forwards interactions to the adapter
  retry(): void;
  startReview(): void;
  exitReview(): void;
  revealFeedback(index: number): void;   // immediate-feedback flow
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

Throws when called on a page without `pageConfig.quiz`. Three telemetry-only DOM events also fire (`tessera-quiz-question-answered`, `tessera-quiz-before-submit`, `tessera-quiz-retry`); none of them write to the adapter.

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

### `useCompletion`

Trigger course completion from any component, and reactively read the current completion status. Active under `completion.mode: "manual"`; in any other mode `markComplete()` is a no-op with a one-shot dev warning. See [Manual completion](#manual-completion).

```ts
function useCompletion(): {
  /** Idempotent — only the first call per session has an effect. */
  markComplete(): void;
  readonly completionStatus: 'incomplete' | 'complete';
};
```

### `usePersistence<T>(key)`

Per-widget persistent state. Survives reload on every adapter: `localStorage` for web, SCORM `cmi.suspend_data` for SCORM 1.2/2004, xAPI State API for cmi5. Reads sync; writes batched by the adapter. JSON-serializable values only.

```ts
function usePersistence<T>(key: string): {
  get(): T | null;
  set(value: T): void;
};
```

```svelte
<script>
  import { usePersistence } from 'tessera-learn';

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

The lifecycle stream (Initialized / Completed / Passed / Failed / Terminated under cmi5; `cmi.*` writes under SCORM) is sent automatically. See [LMS Adapter Reference](#lms-adapter-reference). To emit your own xAPI verbs, use `useXAPI()`:

```ts
import { useXAPI } from 'tessera-learn';

const xapi = useXAPI();             // XAPIClient | null
xapi?.sendStatement({
  verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
  object: { id: `${xapi.getActivityId()}#diagram-1` },
});
```

`useXAPI()` is a plain function (not a Svelte context hook), callable from anywhere: component setup, event handlers, async callbacks, plain `.ts` modules. Returns `null` when no LRS is configured or before adapter init resolves; null-check and degrade gracefully.

The publisher fills in `actor`, `timestamp`, `id` (UUID), `context.contextActivities.grouping`, `context.registration` (cmi5), and the `sessionid` extension (cmi5). You supply `verb`, `object` (defaults to the activity), and optionally `result`, `context`, `attachments`.

### Configure the destination: `course.config.js`

`config.xapi` is one destination, or an array of them. The destination is always declared explicitly. There is no implicit default.

```js
xapi: {
  endpoint: 'https://lrs.example.com/xapi/',
  auth: () => fetch('/api/lrs-token').then(r => r.text()),
  actor: () => getCurrentUser(),     // or a static Agent object
  activityId: 'https://example.com/courses/intro-to-x',
}

// cmi5 only: inherit the LMS launch LRS (endpoint+auth+actor+activityId+registration):
xapi: { endpoint: 'lms' }

// Fan out (at most one 'lms' entry):
xapi: [
  { endpoint: 'lms' },
  { endpoint: 'https://analytics.example.com/xapi/', auth, actor, activityId },
]
```

Each destination has its own queue, auth resolver, and retry loop. One UUID is minted per `sendStatement` and reused across destinations, so all LRSes see the same statement id (idempotent dedupe works).

### Per-mode behaviour

| Mode | `xapi` not set | `xapi.endpoint: 'lms'` | `xapi: {endpoint, ...}` (explicit) |
|------|---------------|------------------------|-----------------------------------|
| **cmi5** | `useXAPI()` → null | Inherits launch LRS; shares queue with lifecycle stream | Independent publisher; `actor` defaults to launch actor |
| **scorm12** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` derived from `cmi.learner_id` |
| **web** | `useXAPI()` → null | **Config error** | Independent publisher; `actor` **required** in config |

### Actor resolution

Priority order (top wins):

1. **Author-supplied `xapi.actor`**: always wins.
2. **cmi5 launch actor**: under cmi5, the publisher uses the same Agent the LMS handed us at launch.
3. **SCORM-derived actor**: under scorm12/scorm2004, the publisher synthesizes:
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

Mid-session identity change (e.g., learner logs in/out without reloading) is **not supported in v1**. Actor is resolved once per page-load and cached. Reload the runtime on identity change.

### Auth

v1 supports **Basic auth only**. The publisher prepends `Basic ` to whatever your `auth` value resolves to; pass the credential value, not the full header.

For OAuth-protected LRSes, wrap the token exchange in your `auth` function and return a Basic credential the LRS accepts (or run a thin proxy that converts).

The function form is re-invoked once on a 401 to cover short-lived tokens that have just expired. Two consecutive 401s mark the auth resolver dead for the publisher's lifetime. Every subsequent send fails fast without hitting the LRS. Reload the runtime to retry.

**Static-string `auth` ships in your bundle**: fine for demos, never for production. Use a function that fetches a server-brokered short-lived token instead.

### Retry policy

- **Default:** 3 attempts with exponential backoff (100ms, 200ms, 400ms).
- **5xx / network errors** retry. **4xx** short-circuits; retrying won't help.
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

`destinations[]` lets you act on partial failures under fan-out: one LRS can be down without affecting the others.

### Validation

The publisher checks three things before sending:

1. `verb.id`: present, non-empty string.
2. `object.id`: non-empty string when `object` is supplied.
3. `result.score.scaled`: number in `[-1, 1]` when supplied.

Everything else passes through. The LRS gives clearer errors for IRI / extension / attachment shape issues than we can; failures surface via `destinations[].error`.

### Mode-specific caveats

**SCORM (1.2 / 2004).** Actor is auto-derived from the LMS data model; supply `actor` explicitly to use a different IFI (`mbox`, `openid`). **CORS** is the painful one: the LRS must allow the LMS-served origin, and many don't by default. cmi5's `sessionid` extension does not exist here; attach your own extension if you need to group statements by session. In dev (WebAdapter fallback), an explicit `xapi` destination with no author actor cannot synthesize an Agent, so `sendStatement` rejects with an explicit error.

**Web.** The bundle is public, so static `auth: 'Basic abc123'` leaks. Always use a function that fetches a server-brokered short-lived token. CORS matters for the token endpoint too. Three actor patterns: hardcoded anonymous, author-wired (`actor: () => getCurrentUser()`), or query-string `?actor=...` mirroring cmi5.

**cmi5 with `endpoint: 'lms'`.** Author and adapter share one publisher instance and one queue, so ordering is preserved (no race between an author's `experienced` and the adapter's `Completed`). Running locally without launch params, `sendStatement` rejects with a missing-params error. No silent fallback. Point `endpoint` at a local LRS for dev.

**Page unload.** Once unload begins, every publisher is marked unloading and `useXAPI()?.sendStatement(...)` calls reject; this is required to keep cmi5 Terminated last on the wire (§9.3.6). Record-at-the-end work belongs in a child component's `onDestroy`, not `beforeunload`.

### Non-goals (v1)

- Bearer / OAuth credentials at the publisher level (wrap in your `auth` function).
- Statement signing / attachments helpers (the publisher accepts attachments but doesn't help build them).
- Offline queue / IndexedDB durability.
- LRS State API access for non-cmi5 modes.
- Voiding statements.
- Mid-session actor refresh (`refreshActor()`).
- Group actors (Agent only).

---

## LMS Adapter Reference

The runtime translates author intent (page visits, quiz scores, completion, persistence) into a fixed set of adapter calls. Each export standard maps those calls onto a different LMS contract. This section is the source-of-truth view of what the LMS sees for any given runtime event.

### Cross-mode rollup

| Runtime event | SCORM 1.2 | SCORM 2004 4th | cmi5 |
|---------------|-----------|----------------|------|
| Session start | `LMSInitialize("")`; read `cmi.suspend_data` and `cmi.interactions._count` | `Initialize("")`; read `cmi.suspend_data` and `cmi.interactions._count` | `POST` cmi5 `fetch` URL → token; build publisher; `GET` State API; send **Initialized** statement |
| State persisted (page visited, bookmark moved, chunk revealed, `usePersistence` write, etc.) | `LMSSetValue("cmi.suspend_data", json)` (microtask-coalesced) | `SetValue("cmi.suspend_data", json)` (microtask-coalesced) | State API `PUT` `tessera-state` document, chained on the publisher queue |
| Graded quiz scored | `LMSSetValue("cmi.core.score.raw"\|"min"\|"max", …)` then `LMSSetValue("cmi.core.lesson_status", "passed"\|"failed")` | `SetValue("cmi.score.raw"\|"min"\|"max"\|"scaled", …)` then `SetValue("cmi.success_status", "passed"\|"failed")` | **Passed** or **Failed** statement, with `result.score.scaled` and `result.duration` (one-shot per session) |
| Course completion changes | Funneled into `cmi.core.lesson_status` (only one field exists) | `SetValue("cmi.completion_status", "completed"\|"incomplete")` | **Completed** statement with `result.completion = true`, `result.duration`, `result.score?` (one-shot per session) |
| Author marks complete (`completion.mode: "manual"`) | `cmi.core.lesson_status = "completed"` (or `"passed"`/`"failed"` if `requireSuccessStatus` set) | `cmi.completion_status = "completed"`; `cmi.success_status = "unknown"` (or `"passed"`/`"failed"` if `requireSuccessStatus` set) | **Completed** statement; **Passed**/**Failed** if `requireSuccessStatus` set |
| Question answered (graded or standalone, inside or outside a quiz) | `cmi.interactions.{n}.id` / `student_response` / `result` / `time` / `type` (n continues from prior `_count`) | `cmi.interactions.{n}.id` / `learner_response` / `result` / `timestamp` / `type` (n continues from prior `_count`) | **Answered** statement; object `${activityId}#${questionId}`, definition `cmi.interaction` + `interactionType`, `result.response`, `result.success` |
| Resume after reload | Read `cmi.suspend_data` on init; manifest is rebuilt from code, not LMS | Read `cmi.suspend_data` on init | State API `GET` `tessera-state`; lifecycle replays from where the prior session left off |
| Author exit / unload | `LMSSetValue("cmi.core.exit", "suspend"\|"")`, `LMSCommit("")`, `LMSFinish("")` (queue drained synchronously) | `SetValue("cmi.exit", "suspend"\|"normal"\|...)`, `Commit("")`, `Terminate("")` (queue drained synchronously) | If course not yet **Completed**, send **Suspended**; then **Terminated** (always last on the wire, cmi5 §9.3.6) |
| Learner identity (xAPI actor synthesis) | `cmi.core.student_id` + `cmi.core.student_name` | `cmi.learner_id` + `cmi.learner_name` | Launch-supplied actor JSON (Identified Agent) |
| Persistence cap | ~4096 chars per spec; many LMSes allow more, but plan for 4 KB | 64000 chars per spec | LRS-defined (typically unbounded for State API documents) |
| Score scale exposed to LMS | `score.raw` only (0–100) | `score.raw` (0–100) **and** `score.scaled` (0–1) | `result.score.scaled` (0–1) |

`commit()` is microtask-coalesced. Multiple state mutations within one tick collapse to a single `LMSCommit` / `Commit`. cmi5 statements are individual (no batched commit).

### SCORM 1.2 notes

API discovery: walks `window.parent` / `window.opener` up to 10 levels looking for `API`.

**One status field.** `cmi.core.lesson_status` collapses completion and pass/fail. The runtime resolves them by priority: success (`passed` / `failed`) wins when known; otherwise completion (`completed` / `incomplete`) is written. There is no "unknown"; until a graded quiz produces a result, the LMS sees `incomplete`.

**Mastery is Tessera's, not the LMS's.** Pass/fail is computed from `scoring.passingScore`. `cmi.student_data.mastery_score` is read-only for this runtime.

**Not implemented.** No `cmi.objectives.*` writes. No SCORM 1.2 sequencing; `navigation.canAccess` is the only gating layer, and the LMS sees one SCO. SCORM 1.2 `time-out` / `logout` exit values are not emitted.

**Local testing.** Upload `dist/*-scorm12.zip` to [SCORM Cloud](https://cloud.scorm.com) (free tier) or [Reload SCORM Player](https://github.com/reload/reload). Inspect the LMS API call log to confirm `lesson_status` and `cmi.interactions.*` look right.

### SCORM 2004 4th notes

API discovery: `API_1484_11` via the same parent/opener walk.

**Two status fields, both written.** `cmi.completion_status` and `cmi.success_status` are independent. `unknown` is written *explicitly* when no graded result exists; leaving it null causes some LMSes (notably SCORM Cloud) to roll a null up to `passed` during status rollup.

**LMS-side fields untouched.** `cmi.completion_threshold` and `cmi.scaled_passing_score` are LMS-owned; Tessera owns the threshold via `scoring.passingScore`.

**Not implemented.** `imsss:sequencing` rules are omitted from `imsmanifest.xml` by design. No `cmi.objectives.*`, no `cmi.adl.nav.*` writes.

**Local testing.** SCORM Cloud is the easiest end-to-end check. Moodle, Cornerstone, SuccessFactors, and Canvas (via Rustici Engine) accept `dist/*-scorm2004.zip` directly.

### cmi5 notes

**Launch contract.** The LMS opens the course URL with `endpoint`, `fetch`, `actor` (JSON-encoded Identified Agent), `activityId`, and optionally `registration`. Discovery succeeds when all four required params are present; otherwise `LMSAdapterError`.

**Token fetch is single-use** (cmi5 §6.2). On failure, reload from the LMS to retry. The token is used as a `Basic` credential, not Bearer.

**Lifecycle order.** **Initialized** → **Answered** (per question on submit) → **Completed** → **Passed** / **Failed** → **Suspended** (only if not Completed) → **Terminated** (always last, cmi5 §9.3.6). Completed / Passed / Failed are one-shot per session; once dispatched, the corresponding setter no-ops. A reloaded session may re-dispatch them, which is intended: each session sends its lifecycle exactly once.

**Required result fields.** Completed: `completion: true`, `duration`. Passed/Failed: `success`, `duration`. Terminated: `duration` (§9.5.4.1). All include `result.score.scaled` when a score is known.

**Sessionid extension.** `cmi5Mode` injects the spec-required `sessionid` context extension on every statement.

**State persistence.** `tessera-state` document via the State API, keyed by `activityId` + `agent` + `registration?` + `stateId='tessera-state'`. Writes chain onto the publisher's queue so the suspend payload lands before Terminated.

**Not implemented.** No multi-AU courses (one course = one AU in v1). No **Waived** or **Abandoned** verbs. No mid-session actor refresh. No `MoveOn` criterion in `cmi5.xml`: completion is decided runtime-side; the LMS evaluates MoveOn against the verbs the runtime *does* emit.

**Local testing.** Upload `dist/*-cmi5.zip` to SCORM Cloud and use the cmi5 dispatch URL it generates, the closest free equivalent to a real LMS launch.

### Common adapter behaviour

**Queue + retry.** SCORM adapters serialize every `LMSSetValue` / `LMSCommit` through a sequential queue with exponential-backoff retry on transient errors. Retry warnings include the real LMS error code (`GetLastError`), e.g. `405 Incorrect Data Type` rather than a generic "LMS call failed".

**Unload.** `terminate()` cannot run async retries; the page is going away. SCORM drains the queue synchronously (single attempt per pending op) before `Commit` + `Terminate` / `LMSFinish`. cmi5 marks the publisher unloading and uses `keepalive: true` so the browser does not cancel in-flight statements.

**Interaction encoding.** `formatResponse` / `formatCorrectPattern` follow SCORM 2004 4th RTE §4.2.7 delimiters: `[,]` items, `[.]` pairs, `[:]` ranges. SCORM 1.2 and cmi5 reuse the encoding (cmi5 embeds it in `result.response` / `definition.correctResponsesPattern`).

**Failure surface.** Anything thrown from `adapter.init()` is caught by `App.svelte` and rendered as a visible "This course can't run here" panel. Never a silent degradation.

---

## Custom Layouts

Drop `layout.svelte` at the project root to replace the default sidebar/topbar/prev-next chrome. The runtime uses it whenever it exists.

The contract: the file receives a single `page` snippet prop and renders it where the active page should appear. Use the hooks for everything else.

```svelte
<!-- layout.svelte -->
<script>
  import { useNavigation, useProgress } from 'tessera-learn';

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

To keep most of the default chrome and swap one piece, import `DefaultLayout` from `tessera-learn` and compose around it.

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
  import { useQuestion, usePersistence } from 'tessera-learn';

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
  import { useNavigation, useProgress } from 'tessera-learn';

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
import { sequentialAccess } from 'tessera-learn';

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

Drop `quiz.svelte` at the project root to replace the built-in `<Quiz>`. The runtime wraps every page with `pageConfig.quiz` in your shell instead of the carousel default. The shell uses only the public `useQuiz()` API; no imports from `tessera/runtime/*`.

```svelte
<!-- quiz.svelte -->
<script>
  import { useQuiz } from 'tessera-learn';

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

Always submit through `useQuiz().submit()`. See [Data contract](#data-contract--what-the-lms-sees).

### Recipe 5: Graded standalone question

A single inline reflection, not in a `<Quiz>` but `graded: true`, so it counts toward course success. Useful for "must answer to pass" gates without the quiz wrapper.

```svelte
<!-- pages/04-reflection/01-reflect/reflect.svelte -->
<script module>
  export const pageConfig = { title: "Reflection" };
</script>

<script>
  import { useQuestion } from 'tessera-learn';

  let answer = $state('');

  const q = useQuestion({
    id: 'why-it-matters',
    graded: true,
    response: () => ({
      type: 'long-fill-in',
      response: answer,
      // No `correct`: any answer accepted; we just want completion.
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

{#if q.submitted}<p>Thanks. Your reflection has been recorded.</p>{/if}
```

The LMS sees a graded `long-fill-in` interaction. Course success rolls up across all graded items: quizzes and standalones alike.

### Recipe 6: Chunked-reveal page with `markChunk`

A page that reveals sections one at a time as the learner advances. `markChunk(pageIndex, chunkIndex)` records the highest revealed chunk so the page resumes mid-scroll on reload. `chunkProgress` is the page-keyed map of those highs.

```svelte
<!-- pages/02-deep-dive/01-concepts/long-read.svelte -->
<script module>
  export const pageConfig = { title: "How it works" };
</script>

<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  const nav = useNavigation();
  const progress = useProgress();
  const pageIndex = $derived(nav.currentPageIndex);

  const TOTAL_CHUNKS = 4;
  let revealed = $state(progress.chunkProgress.get(pageIndex) ?? 0);

  function reveal() {
    revealed = Math.min(revealed + 1, TOTAL_CHUNKS - 1);
    progress.markChunk(pageIndex, revealed);
  }
</script>

{#each Array(revealed + 1) as _, i}
  <section>
    <h2>Step {i + 1}</h2>
    <p>Content for step {i + 1}.</p>
  </section>
{/each}

{#if revealed < TOTAL_CHUNKS - 1}
  <button onclick={reveal}>Show next</button>
{/if}
```

Use this when a page is long enough that "fully visited" is a meaningful state separate from "loaded once." The runtime persists chunk progress through the same adapter pipeline as everything else.

### Recipe 7: Persisted UI state with `usePersistence`

`usePersistence` is not just for question state. Any JSON-serialisable value the learner produces can survive reload through it. Here, a sidebar collapsed/expanded toggle that the learner expects to stay set across sessions.

```svelte
<!-- in any page component, layout.svelte, or a custom widget -->
<script>
  import { usePersistence } from 'tessera-learn';

  const ui = usePersistence('sidebar-prefs');
  let collapsed = $state(ui.get()?.collapsed ?? false);
  $effect(() => ui.set({ collapsed }));
</script>

<button onclick={() => (collapsed = !collapsed)}>
  {collapsed ? 'Expand' : 'Collapse'}
</button>
```

Keys are namespaced per course, so two courses on the same LMS don't collide. Under SCORM the value rides in `cmi.suspend_data`; under cmi5 in the xAPI State API; under web in `localStorage`.

---

## Constraints

- **No runtime data fetching in pages.** Page content is static; no `fetch()` or dynamic loaders in page components.
- **Public API only.** Import from `tessera-learn`. Do **not** import from `tessera-learn/runtime/*`; those paths are internal and may change.
- **`pageConfig` is JSON5-parseable.** Trailing commas, unquoted keys, single quotes are fine; variables, function calls, template literals, and computed values are not.
- **Third-party libraries** must be project dependencies in `package.json`.
