# AGENTS.md: Tessera Course Authoring Guide

Tessera is an **LMS tracking runtime** for interactive learning content. It handles SCORM 1.2 / SCORM 2004 / cmi5 / xAPI statements, progress state, completion and success rollup, persistence, and navigation gating, and gets out of the way for the presentation layer.

Build a course with built-in components, your own (via the hooks), or any mix. This file is the canonical reference for any agent or human author working in a Tessera project. Read it before generating or editing course code.

---

## Running the project

From the project root (the project is set up for `pnpm` — Node's corepack provisions it automatically):

```bash
pnpm install              # first time only
pnpm dev                  # dev server at http://localhost:5173 (Ctrl+C to stop)
pnpm export               # build + package for the LMS standard configured in course.config.js
pnpm validate             # run project validation only — no server, no bundle
pnpm check                # validate, then the runtime accessibility audit (axe) over the built course
```

The dev server hot-reloads as you edit pages, layouts, components, and `course.config.js`. The `export` command produces a SCORM 1.2, SCORM 2004, cmi5, or static-web bundle depending on `course.config.js`.

`pnpm validate` runs the same checks as `dev` and `export` (page syntax, manifest shape, `pageConfig`, question components, asset references, LMS data-contract bypass, and the static accessibility rules) and exits non-zero if any fail. Use it as a fast feedback loop after editing — it's the quickest way to confirm a change is structurally sound.

`pnpm check` runs `validate` and then the deeper, opt-in pass (`tessera a11y`): it builds the course, renders every page in a headless browser, and runs [axe-core](https://github.com/dequelabs/axe-core) to catch issues a static scan can't see (computed ARIA, real rendered contrast). The runtime audit drives Playwright, which needs a browser binary once per machine:

```bash
pnpm exec playwright install chromium
```

See [Accessibility](#accessibility).

`dev`, `export`, `validate`, and `check` are **reserved script names** — each is a thin alias for the matching `tessera` subcommand. Don't repurpose them.

### Updating the framework

Updating is a plain dependency bump from the project root — there is no `create-tessera upgrade`:

```bash
pnpm add tessera-learn@latest
```

You don't have to take the newest release — pin a specific version with `pnpm add tessera-learn@0.1.0` (or set the version in `package.json` and run `pnpm install`) for a reproducible build or to skip a major.

The framework owns the build (there is no `vite.config.js`), the reserved scripts, and this authoring guide, so nothing in your tree needs reconciling. This guide ships _inside_ `tessera-learn` (you're reading `node_modules/tessera-learn/AGENTS.md`), so bumping the dependency updates it automatically. Your project's root `CLAUDE.md` and `AGENTS.md` are just small pointers to this file — they never need to change.

### Customising the build (optional)

Tessera runs Vite for you with the right plugins; you never write a `vite.config.js`. If you genuinely need to extend the build, add a `tessera.config.js` at the project root. It is a **partial** Vite config that Tessera merges on top of its own — you only specify the delta, and `tesseraPlugin()` (with the Svelte compiler) stays wired in automatically:

```js
// tessera.config.js — merged on top of Tessera's Vite config
export default {
  server: { port: 4000 },
  resolve: { alias: { $lib: '/src/lib' } },
};
```

`tessera.config.js` is never scaffolded and never touched by updates — once you add it, it's yours.

---

## Project Structure

The framework imposes the **minimum** structure it needs to discover content. Everything else is convention you can opt into.

### Required

```
my-course/
├── course.config.js          # Course configuration
├── package.json
└── pages/                     # Course content (at least one section dir with .svelte files)
    └── intro/
        └── welcome.svelte
```

`pages/` exists, contains one or more **section directories**, each containing one or more `.svelte` files (directly or inside lesson subdirectories). The runtime works with that alone.

### Optional

```
my-course/
├── layout.svelte              # Custom chrome (replaces default sidebar/topbar)
├── quiz.svelte                # Custom quiz shell (replaces built-in <Quiz>)
├── assets/                    # Images, audio, video files (referenced via $assets/)
├── styles/                    # Custom CSS overrides
├── CLAUDE.md                  # Pointer that imports this guide for Claude Code
├── AGENTS.md                  # Pointer to this guide for other agents
└── pages/
    └── 01-intro/              # Numeric prefix → controls order
        ├── _meta.js           # Override section title; control page order
        ├── welcome.svelte     # Page directly in the section ("flat" shape)
        └── 01-getting-started/  # Lesson subdirectory ("nested" shape)
            ├── _meta.js
            └── overview.svelte
```

### What you can edit

You own everything in the project directory: `pages/`, `course.config.js`, `layout.svelte`, `quiz.svelte`, custom components, `assets/`, and `styles/`. Edit those freely.

**Never edit `node_modules/`.** `node_modules/tessera-learn/` is the framework itself — edits there are git-ignored, work only until the next `pnpm install`, and are silently wiped when the course's tessera-learn version is updated. (There is no `vite.config.js` to edit either; the build is the framework's. For a genuine build tweak, add a `tessera.config.js` — see [Customising the build](#customising-the-build-optional).) If you think you need to change framework behaviour, you're looking for an extension point instead:

- **New question type or interactive widget** → a custom component using the `useQuestion` hook.
- **Different course chrome** (header, nav, layout) → `layout.svelte`.
- **Different quiz UI** → `quiz.svelte` using the `useQuiz` hook.
- **Styling** → `styles/`.
- **Navigation, completion, scoring, or export target** → `course.config.js`.

If none of those fit, the limitation is real — surface it rather than patching around it in `node_modules/`.

### Hierarchy and ordering

The manifest is always **section → lesson → page**. Files directly in a section folder are flattened into one implicit lesson with the section's title; lesson subdirectories nest as expected. Both shapes can coexist.

Sorting is alphabetical by directory / filename. Numeric prefixes on directories (`01-`, `02-`, …) give explicit ordering without renaming the files inside, and are stripped from slugs and titles (`01-getting-started/` → slug `getting-started`, title "Getting Started"). Use `_meta.js` to control page order within a lesson rather than prefixing page filenames.

### `_meta.js` files

**Optional everywhere.** When absent, titles fall back to the title-cased slug (`01-getting-started/` → "Getting Started") and pages sort alphabetically by filename. **Omit the file entirely** when those defaults are what you want — `pages: ["only-page"]` on a single-page lesson is a no-op, and `title: "Splash"` on `01-splash/` duplicates the auto-derived title.

Reach for `_meta.js` only when the override is real:

```js
// section or lesson _meta.js: title override (folder name doesn't auto-derive to what you want)
export default { title: 'How to play' }; // folder is `01-intro`
```

```js
// lesson _meta.js: explicit page order
export default {
  title: 'Welcome',
  pages: ['welcome', 'objectives'],
};
```

Pages listed in `pages` come first in listed order; any unlisted `.svelte` files are appended alphabetically.

---

## Authoring Surfaces

1. **Built-in components**: `Callout`, `Image`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, etc., from `tessera-learn`. Use, compose, or skip.
2. **Hooks**: `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`. The stable contract between custom widgets and the runtime. Anything the built-ins do, you can do.
3. **Custom layout**: drop `layout.svelte` at the project root to replace the default chrome.
4. **Custom quiz shell**: drop `quiz.svelte` at the project root to replace the built-in quiz UI for every page that has `pageConfig.quiz`. Authors call `useQuiz()` for state and dispatch; question widgets continue to register through `useQuestion`.
5. **Custom xAPI**: `useXAPI()` returns a publisher for emitting your own xAPI verbs to one or more LRSes. See [Custom xAPI statements](#custom-xapi-statements).

A custom widget that calls `useQuestion` and emits an `Interaction` is treated identically to `<MultipleChoice>`, with the same scoring, LMS reporting, and persistence.

---

## Creating Pages

Each page is a `.svelte` file inside a lesson folder.

### Basic page

```svelte
<h1>Welcome</h1><p>Standard HTML works as-is.</p>
```

### Page configuration

`pageConfig` sets the page title and configures quizzes. It must be a **static object literal** in a module script block. No variables, function calls, or computed values.

Both `<script module>` (Svelte 5) and `<script context="module">` (legacy) are accepted by the manifest parser.

```svelte
<script module>
  export const pageConfig = {
    title: 'Introduction to the Topic',
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

| Prop   | Type                                          | Default  |
| ------ | --------------------------------------------- | -------- |
| `type` | `"info" \| "warning" \| "tip" \| "important"` | `"info"` |

Children become the body. A11y: `role="note"` with type-appropriate `aria-label`.

```svelte
<Callout type="warning"><p>Be careful.</p></Callout>
```

### Image

Lazy-loaded image with optional caption. Renders as `<figure>`/`<figcaption>`.

| Prop         | Type      | Description                                                                                                                                                              |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src`        | `string`  | Image URL. `$assets/` prefix supported                                                                                                                                   |
| `alt`        | `string`  | **Required unless `decorative`.** Alt text describing the image                                                                                                          |
| `decorative` | `boolean` | Set `decorative={true}` for a purely ornamental image — renders an empty `alt` + `aria-hidden` so assistive tech skips it. Use this _instead of_ `alt`, not alongside it |
| `caption`    | `string`  | Optional caption                                                                                                                                                         |

Every `<Image>` must resolve to exactly one of: meaningful `alt` text, or `decorative={true}`. The validator errors if neither is present (a missing/empty `alt` is the most common accessibility miss). `decorative` is a **boolean** — write `decorative` or `decorative={true}`, never `decorative="true"` (a string is always truthy, so the validator rejects it).

```svelte
<Image
  src="$assets/diagram.png"
  alt="System architecture diagram"
  caption="Figure 1"
/>

<!-- Ornamental divider that adds nothing for a screen reader: -->
<Image src="$assets/flourish.svg" decorative={true} />
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
  <CarouselSlide
    ><h3>Step 1</h3>
    <p>Plan.</p></CarouselSlide
  >
  <CarouselSlide
    ><h3>Step 2</h3>
    <p>Build.</p></CarouselSlide
  >
  <CarouselSlide
    ><h3>Step 3</h3>
    <p>Deploy.</p></CarouselSlide
  >
</Carousel>
```

### RevealModal

Modal triggered by user interaction. Uses Svelte 5 snippets for `trigger` and `content`. A11y: `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close.

| Prop      | Type      | Description                       |
| --------- | --------- | --------------------------------- |
| `title`   | `string`  | Modal label for screen readers    |
| `trigger` | `snippet` | Click target that opens the modal |
| `content` | `snippet` | Modal body                        |

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

| Prop         | Type     | Description                                                                                                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | `string` | Video URL or `$assets/` path                                                                                                                                  |
| `title`      | `string` | **Required.** Accessible label for the player                                                                                                                 |
| `tracks`     | `array`  | Caption/subtitle tracks for **native** video, rendered as `<track>` (see shape below). Ignored for YouTube/Vimeo embeds — the platform owns their captions    |
| `transcript` | `string` | Transcript text shown in a `<details>` disclosure below the player. To load it from a file, import the file with a `?raw` suffix and pass it in (see example) |

`title` is the accessible name and is required (empty/whitespace is rejected). For **WCAG 1.2** the validator also warns when a video has no captions: native video with no `tracks` and no `transcript`, or an embed with no `transcript` (embeds can't carry your `<track>` files, so supply a transcript). Each `tracks` entry is `{ src, kind?: 'captions' | 'subtitles', srclang?, label? }`.

```svelte
<script>
  // ?raw inlines the file's text at build time — works under file://, SCORM, and subpaths
  import intro from '$assets/intro.txt?raw';
</script>

<Video
  src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  title="Intro"
  transcript={intro}
/>
<Video
  src="$assets/demo.mp4"
  title="Demo"
  tracks={[
    {
      src: '$assets/demo.en.vtt',
      kind: 'captions',
      srclang: 'en',
      label: 'English',
    },
  ]}
/>
```

### Audio

Native player. A11y: `aria-label` from title.

| Prop         | Type     | Description                                                                                                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | `string` | Audio URL or `$assets/` path                                                                                                                                  |
| `title`      | `string` | **Required.** Accessible label for the player                                                                                                                 |
| `tracks`     | `array`  | Caption tracks rendered as `<track>` (same shape as `Video`)                                                                                                  |
| `transcript` | `string` | Transcript text shown in a `<details>` disclosure below the player. To load it from a file, import the file with a `?raw` suffix and pass it in (see example) |

`title` is required. For **WCAG 1.2.1** the validator warns when an `<Audio>` has no `transcript` — audio-only content needs a text alternative.

```svelte
<script>
  import lecture from '$assets/lecture-01.txt?raw';
</script>

<Audio src="$assets/lecture-01.mp3" title="Lecture 1" transcript={lecture} />
```

---

## Quizzes

A quiz page is a normal page with `pageConfig.quiz` set. The runtime wraps the page in the resolved quiz shell (built-in `<Quiz>` by default; a project-supplied `quiz.svelte` if one exists at the project root). Page authors no longer need their own `<Quiz>` wrapper. Drop question components directly at the page root.

### Setup

A complete, copy-paste-ready quiz page — `pageConfig.quiz` set, components imported, questions dropped at the page root:

```svelte
<script module>
  export const pageConfig = {
    title: 'Module 1 Quiz',
    quiz: { graded: true, maxAttempts: 3 },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from 'tessera-learn';
</script>

<MultipleChoice
  id="q-planet"
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth', 'Mars']}
  correct={1}
/>

<FillInTheBlank
  id="q-symbol"
  question="What element has the symbol 'O'?"
  answers={['Oxygen']}
/>
```

### Common mistakes

Watch for these:

- **`correct` is a 0-based index, not the answer text.** `correct={1}` means the second option. It must be in range for `options`.
- **Every required prop must be present.** `MultipleChoice` needs `question` + `options` + `correct`; `FillInTheBlank` needs `question` + `answers`; `Matching` needs `question` + `pairs`; `Sorting` needs `question` + `items` + `targets` + `correct`.
- **`Sorting.correct` is a parallel array to `items`** — same length, each entry a valid index into `targets`.
- **Question `id`s must be unique within a page.** Duplicates collide in `cmi.interactions`.
- **Don't add your own `<Quiz>` wrapper.** A page with `pageConfig.quiz` is wrapped automatically — just drop the question components at the page root.
- **Custom widgets must register through `useQuestion` and submit through `useQuiz().submit()`.** See [Data contract](#data-contract-what-the-lms-sees) below.

### Data contract: what the LMS sees

Whatever quiz UI you build, the LMS sees the same `cmi.interactions` it would from the built-in: every question registered through `useQuestion` flows through the persistence adapter. Each interaction is reported the moment the widget calls `q.commit()` — atomic widgets (MCQ, true-false, likert) call it on click, composite widgets (matching, sorting, fill-in) call it on blur or final-state. `useQuiz().submit()` calls commit on any question whose widget hasn't yet, as a safety net. The reporting cost — one xAPI Answered / one `cmi.interactions.n` block per call — happens incrementally throughout the session rather than batching at the end, so a learner closing the tab after the last commit still gets credit. Bypass `useQuestion`/`useQuiz` and the quiz reports nothing.

### `pageConfig.quiz` fields

| Field           | Type                                 | Default    | Description                                                                                                                |
| --------------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `graded`        | `boolean`                            | `false`    | Whether the score counts toward course success                                                                             |
| `gatesProgress` | `boolean`                            | `false`    | Whether passing is required to access the next page                                                                        |
| `maxAttempts`   | `number`                             | `Infinity` | Max attempts                                                                                                               |
| `feedbackMode`  | `"review" \| "immediate" \| "never"` | `"review"` | When feedback renders. See below.                                                                                          |
| `retryMode`     | `"full" \| "incorrect-only"`         | `"full"`   | `"full"` resets every answer on retry; `"incorrect-only"` keeps questions the learner already got right locked as correct. |

`feedbackMode` values: `"immediate"` reveals after the shell calls `revealFeedback(q)` and locks the answer; `"review"` shows feedback only on the post-submit review screen; `"never"` disables feedback entirely (the built-in `<Quiz>` hides the Review button).

`gatesProgress: true` blocks navigation to the next page until the learner passes. Works in both `free` and `sequential` navigation modes.

### Per-question weighting

Pass `weight` to `useQuestion` (and through built-in widget props) to change how much a question pulls on the page-level score. Defaults to 1; non-positive values are treated as 1.

```svelte
<MultipleChoice id="q-easy" weight={1} ... />
<MultipleChoice id="q-hard" weight={3} ... />
```

Weights apply identically inside a `<Quiz>` and to standalone questions on a plain page — the same widget answered the same way produces the same page score either way.

The page-level score is the weighted-correct percentage: `Σ(weight × correct) / Σ(weight) × 100`, rounded. With every weight at the default 1 this is the plain correct-count percentage.

The LMS still sees each question as a single pass/fail interaction; weights only affect the page-level `cmi.core.score.raw` rollup, not `cmi.interactions.*`.

### Question types

#### MultipleChoice

| Prop                | Type       | Description                                                                                    |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `question`          | `string`   | Prompt                                                                                         |
| `options`           | `string[]` | Answer options                                                                                 |
| `correct`           | `number`   | Index of correct option (0-based)                                                              |
| `correctFeedback`   | `string`   | Optional                                                                                       |
| `incorrectFeedback` | `string`   | Optional                                                                                       |
| `optionFeedback`    | `string[]` | Optional per-option feedback                                                                   |
| `weight`            | `number`   | Page-level rollup weight (default `1`). See [Per-question weighting](#per-question-weighting). |

```svelte
<MultipleChoice
  question="What is the capital of France?"
  options={['London', 'Berlin', 'Paris', 'Madrid']}
  correct={2}
/>
```

#### FillInTheBlank

| Prop            | Type       | Default | Description              |
| --------------- | ---------- | ------- | ------------------------ |
| `question`      | `string`   |         | Prompt                   |
| `answers`       | `string[]` |         | Acceptable answers       |
| `caseSensitive` | `boolean`  | `false` | Comparison casing        |
| `weight`        | `number`   | `1`     | Page-level rollup weight |

`answers` only needs distinct spellings; `caseSensitive: false` already handles case variants.

```svelte
<FillInTheBlank
  question="What element has the symbol 'O'?"
  answers={['Oxygen']}
/>
```

#### Matching

| Prop       | Type                              | Description                            |
| ---------- | --------------------------------- | -------------------------------------- |
| `question` | `string`                          | Prompt                                 |
| `pairs`    | `{left: string, right: string}[]` | Correct pairs                          |
| `weight`   | `number`                          | Page-level rollup weight (default `1`) |

The right column is auto-shuffled. Click left then right to match (tap on mobile). Click a matched pair to unmatch. All pairs must be correct.

```svelte
<Matching
  question="Match country to capital:"
  pairs={[
    { left: 'France', right: 'Paris' },
    { left: 'Germany', right: 'Berlin' },
    { left: 'Japan', right: 'Tokyo' },
  ]}
/>
```

#### Sorting

Drag-and-drop (or click-to-place) into labelled categories.

| Prop       | Type       | Description                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| `question` | `string`   | Prompt                                                          |
| `items`    | `string[]` | Items to sort                                                   |
| `targets`  | `string[]` | Category labels                                                 |
| `correct`  | `number[]` | For each item, the index of its correct target (parallel array) |
| `weight`   | `number`   | Page-level rollup weight (default `1`)                          |

```svelte
<Sorting
  question="Sort each animal:"
  items={['Dog', 'Eagle', 'Salmon', 'Cat', 'Robin', 'Trout']}
  targets={['Mammals', 'Birds', 'Fish']}
  correct={[0, 1, 2, 0, 1, 2]}
/>
```

### Standalone questions

All four question components also work outside `<Quiz>` for inline practice. Standalone widgets render their own Check / Retry buttons.

| Prop         | Type     | Default    | Description                               |
| ------------ | -------- | ---------- | ----------------------------------------- |
| `maxRetries` | `number` | `Infinity` | Max retries for standalone widgets        |
| `weight`     | `number` | `1`        | Per-question weight for page-level rollup |

```svelte
<MultipleChoice
  question="What color is the sky on a clear day?"
  options={['Red', 'Blue', 'Green']}
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
    completesOn: 'view',
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

When omitted, the dev runtime warns once after 60 s if completion has not fired.

### Success status

By default `successStatus` stays `"unknown"` under manual — the LMS sees completion without a pass/fail verdict. If you want completion **and** an automatic pass (typical for "acknowledge" flows):

```js
completion: { mode: "manual", requireSuccessStatus: "passed" }  // or "failed"
```

| Adapter        | What the LMS sees on `markComplete()` (no `requireSuccessStatus`)       |
| -------------- | ----------------------------------------------------------------------- |
| SCORM 1.2      | `cmi.core.lesson_status = "completed"`                                  |
| SCORM 2004 4th | `cmi.completion_status = "completed"`, `cmi.success_status = "unknown"` |
| cmi5           | **Completed** statement (no Passed / Failed)                            |
| web            | `localStorage` only                                                     |

With `requireSuccessStatus: "passed"`, SCORM 1.2 writes `lesson_status = "passed"`, SCORM 2004 writes `success_status = "passed"`, and cmi5 emits a **Passed** statement alongside **Completed**.

### Quizzes under manual mode

A graded quiz under `mode: "manual"` reports its score to the LMS gradebook but does **not** drive completion or success — `markComplete()` / `completesOn` does. The build emits a warning to make this explicit. Set `graded: false` (or remove the quiz) if that's not what you want.

### Non-goals

- Combining manual + quiz/percentage rules ("complete when X **and** quiz passed"). Use a `useCompletion()` call inside a custom `$effect` if you need conditional logic.
- Per-learner conditional completion expressed in config — same answer: do it in a component with `useCompletion()`.
- Marking a course **incomplete** after it has been completed. Completion is monotonic in every spec we target. The runtime ignores re-marks.

---

## Assets

Drop files into `assets/`. Reference them with `$assets/` in built-in component props:

```svelte
<Image src="$assets/photo.png" alt="Photo" />
<Video src="$assets/demo.mp4" title="Demo" />
<Audio src="$assets/lecture.mp3" title="Lecture" />
```

In CSS, use a relative path from `styles/`:

```css
.bg {
  background-image: url('../assets/bg.png');
}
```

External URLs work too: `<Image src="https://example.com/img.jpg" alt="..." />`.

At build time the plugin copies `assets/` into `dist/assets/` so `$assets/foo.png` resolves the same way in the shipped bundle as it does in the dev server.

### `$assets/` is three things — know which you're using

`$assets/` is presented as a single convention, but it's actually three distinct mechanisms with different scopes. Custom components have to pick one explicitly; the wrong choice gives a silent 404, not a build error.

1. **Vite import alias** — works in ES `import` statements. Vite resolves `$assets/...` to the project's `assets/` directory and bundles the asset:
   ```js
   import logoUrl from '$assets/logo.svg?url';
   ```
2. **Built-in component prop rewrite** — `Image`, `Audio`, and `Video` rewrite `$assets/foo` → `./assets/foo` internally before rendering. This is why `<Image src="$assets/photo.png">` works.
3. **Build-time copy** — the plugin copies `assets/` to `dist/assets/`, so the document-relative path `./assets/foo.png` resolves identically in dev and in the shipped bundle.

**Raw HTML attributes are not rewritten.** `<img src="$assets/foo.svg">` in a custom component fetches the literal string `/$assets/foo.svg` and 404s — there's no validator warning for this. Same for `new Audio('$assets/...')`, CSS `url()` strings built in JS, etc.

### Asset references in custom components

Pick by use case:

**One-off reference — ES import (preferred):**

```svelte
<script>
  import url from '$assets/diagram.svg?url';
</script>

<img src={url} alt="Diagram" />
```

Build-time bundling, asset hashing, fails the build if missing.

**Collection referenced by name — `import.meta.glob`:**

```js
const signs = import.meta.glob('$assets/signs/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
// then look up by full key:
const url = signs[`/assets/signs/${filename}`];
```

Use this when the asset is chosen at runtime by ID/filename. Same build-time guarantees as a single import.

**Pure runtime string (last resort):**

```js
const src = `./assets/signs/${filename}`;
```

No build-time guarantees, but works when neither pattern above fits (e.g., filenames that come from server data). Equivalent to what `Image`/`Audio`/`Video` do internally.

---

## Styling

Add `.css` files to `styles/`. They load after framework styles and override them.

### CSS custom properties

Override these to theme globally:

| Property                                       | Default                               |
| ---------------------------------------------- | ------------------------------------- |
| `--tessera-primary`                            | `#2563eb`                             |
| `--tessera-primary-light`                      | `#dbeafe`                             |
| `--tessera-primary-dark`                       | `#1e40af`                             |
| `--tessera-text`                               | `#1f2937`                             |
| `--tessera-text-light`                         | `#6b7280`                             |
| `--tessera-bg`                                 | `#ffffff`                             |
| `--tessera-bg-secondary`                       | `#f9fafb`                             |
| `--tessera-border`                             | `#e5e7eb`                             |
| `--tessera-success`                            | `#16a34a`                             |
| `--tessera-error`                              | `#dc2626`                             |
| `--tessera-warning`                            | `#d97706`                             |
| `--tessera-font-family`                        | `'Inter', system-ui, sans-serif`      |
| `--tessera-font-size-base`                     | `1rem`                                |
| `--tessera-line-height`                        | `1.6`                                 |
| `--tessera-spacing-sm` / `-md` / `-lg` / `-xl` | `0.5rem` / `1rem` / `1.5rem` / `2rem` |
| `--tessera-sidebar-width`                      | `280px`                               |
| `--tessera-content-max-width`                  | `800px`                               |

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
  title: 'My Course', // required
  description: '',
  author: '',
  version: '1.0.0',
  language: 'en', // BCP-47 tag for <html lang> (e.g. "en", "fr-CA"); defaults to "en"

  branding: {
    logo: '', // e.g., "$assets/logo.png"
    primaryColor: '#2563eb',
    fontFamily: 'Inter, sans-serif',
  },

  navigation: {
    mode: 'free', // "free" or "sequential"
  },

  completion: {
    mode: 'percentage', // "percentage" | "quiz" | "manual"
    percentageThreshold: 100, // 0–100 (percentage mode)
    // trigger: "page",              // (manual only) opt into build-time check
    // requireSuccessStatus: "passed", // (manual only) "passed" | "failed"
  },

  scoring: {
    passingScore: 70, // optional under "manual" (defaults to 0)
  },

  export: {
    standard: 'web', // "web" | "scorm12" | "scorm2004" | "cmi5"
  },

  // Accessibility checker (all optional — sensible defaults apply)
  a11y: {
    level: 'warn', // "warn" (default) or "error" — "error" makes the promotable a11y rules block the build
    standard: 'wcag2aa', // "wcag2a" | "wcag2aa" (default) | "wcag21aa" — axe ruleset for tessera a11y
    ignore: [], // rule IDs to suppress, e.g. ["tessera/heading-order", "color-contrast"]
  },
};
```

- `language` sets `<html lang>` for screen readers (WCAG 3.1.1). Set it to your course's language as a [BCP-47](https://www.w3.org/International/articles/language-tags/) tag. A missing or implausible value warns and falls back to `"en"`.
- `a11y.level: "error"` promotes the "promotable" accessibility warnings (captions/transcript, heading order, contrast, language, and the Svelte compiler's a11y warnings) to build-blocking errors. Hard contract errors (missing `alt`, missing media `title`) always block regardless of `level`.
- `a11y.ignore` is a flat list matched literally against each diagnostic's rule ID across **all tiers** — the `tessera/…` IDs printed by `validate`, the `a11y_…` IDs from the Svelte compiler, and the bare axe rule IDs (e.g. `color-contrast`) from `tessera a11y`.

- `navigation.mode: "free"` → all pages accessible except those blocked by gating quizzes.
- `navigation.mode: "sequential"` → pages unlock one at a time as each is completed.
- `completion.mode: "percentage"` → course completes when `visitedPages / totalPages * 100 >= percentageThreshold`.
- `completion.mode: "quiz"` → course completes when graded quiz average >= `scoring.passingScore`.
- `completion.mode: "manual"` → course completes when an author-declared trigger fires. See [Manual completion](#manual-completion).

### Minimum config

Every field except `title` has a default. The build merges yours over:

```js
// effective defaults
{
  title: "Untitled Course",
  language: "en",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
}
```

So `export default { title: "My Course" }` is a complete config: free navigation, full-percentage completion, web export, `<html lang="en">`. (The scaffold seeds `language: 'en'` so a fresh course starts without the language warning; set it to your actual language.)

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
        const i = ctx.manifest.pages.findIndex(
          (p) => p.slug === 'lesson-2-quiz',
        );
        return (
          (ctx.progress.quizScores.get(i) ?? 0) >=
          ctx.config.scoring.passingScore
        );
      }
      return true;
    },
  },
};
```

`AccessContext` exposes `pageIndex`, `page`, `manifest`, `progress`, and `config`. The presets `freeAccess` and `sequentialAccess` are re-exported from `tessera-learn` for composition. `resolveAccess(config)` is also exported. It returns the predicate the runtime would use (custom `canAccess` if set, otherwise the matching preset). Useful when you want to wrap rather than replace.

### Build output

`pnpm export` (which wraps `vite build`) writes:

| `export.standard` | What ships                            | Where                                    |
| ----------------- | ------------------------------------- | ---------------------------------------- |
| `web`             | Static site (HTML/CSS/JS + `assets/`) | `dist/` (host on any static file server) |
| `scorm12`         | SCORM 1.2 package                     | `dist/<course>-scorm12.zip`              |
| `scorm2004`       | SCORM 2004 4th Edition package        | `dist/<course>-scorm2004.zip`            |
| `cmi5`            | cmi5 package (AU + manifest)          | `dist/<course>-cmi5.zip`                 |

For LMS exports, upload the zip via your LMS's import flow. For web export, the bundle is a self-contained static site. Drop `dist/` on Netlify, GitHub Pages, S3, or any static host.

### Validation

The Vite plugin runs project validation on every dev start and build (page syntax, manifest shape, `pageConfig` parseability, question components, asset references, LMS data-contract bypass, etc.). Errors abort the build and print as `[tessera error] ...`; warnings print as `[tessera warning] ...` and don't block. Run `pnpm validate` to check without building.

---

## Accessibility

Tessera checks accessibility in two passes, plus components that are accessible by construction.

**Static checks** run inside `validate`, `dev`, and `export` — no extra setup. They cover what's visible in your source: `<Image>` alt-or-`decorative`, `<Video>`/`<Audio>` `title` + captions/transcript, empty question option/answer labels, skipped heading levels (e.g. `h2` → `h4`), `branding.primaryColor` contrast against white, and a well-formed `language` tag. They also route the Svelte compiler's own `a11y_*` warnings through the reporter. Each diagnostic carries a rule ID in brackets (e.g. `[tessera/image-alt]`, `[a11y_missing_attribute]`) — that ID is what `a11y.ignore` and `a11y.level` match.

**Runtime audit** is the opt-in deep pass: `tessera a11y` (run it directly, or via `pnpm check`, which runs `validate` first) builds the course, renders **every** page in a headless browser (including pages gated behind a quiz), runs [axe-core](https://github.com/dequelabs/axe-core), writes `a11y-report.json`, and exits non-zero on any violation at or above an impact threshold (default `serious`). It catches what a static scan can't — computed ARIA, focus order, real rendered contrast.

The runtime audit drives Playwright, which needs a browser binary once per machine:

```bash
pnpm exec playwright install chromium
```

```bash
tessera a11y                      # audit (threshold: serious)
tessera a11y --threshold minor    # stricter
tessera a11y --build              # force a fresh build first
```

The audit renders the course with the web adapter, so it works regardless of your `export.standard` — you don't need an LMS to run it.

The audit's ruleset and severity come from the `a11y` block in `course.config.js` (`standard`, `ignore`); see [`course.config.js`](#courseconfigjs). `a11y-report.json` is build output — it's git-ignored by default.

Hard contract errors (missing `alt`, missing media `title`) always block the build. Everything else is a warning unless you set `a11y.level: "error"`. To silence a specific rule everywhere, add its ID to `a11y.ignore`.

---

## Hooks Reference

Six hooks plus one helper make up the stable contract between widgets and the runtime.

```js
import {
  useQuestion,
  useQuiz,
  useNavigation,
  useProgress,
  useCompletion,
  usePersistence,
  isCorrect,
} from 'tessera-learn';
import type { Interaction } from 'tessera-learn';
```

Each hook is synchronous and must be called during component setup, inside a Tessera course. Calling them outside the runtime throws.

### The `Question` model

Both `useQuiz()` and `useQuestion()` traffic in the same per-question object. A quiz shell iterates `quiz.questions`; a widget gets its own `Question` directly from `useQuestion()`. No indexes, no `getContext('tessera-quiz')` — both halves use the same handle.

```ts
interface Question {
  readonly id: string;
  readonly submitted: boolean;
  readonly correct: boolean | null;
  readonly answer: unknown;
  readonly feedbackVisible: boolean;
  readonly locked: boolean; // input must be read-only: submitted OR feedbackVisible OR isLockedCorrect
  readonly isLockedCorrect: boolean; // narrow case: locked because retry policy preserved this as already-correct
  readonly render: unknown; // snippet the widget registered; shell calls {@render q.render()}
  setAnswer(answer: unknown): void;
  commit(): void; // signal the answer is final; triggers the per-question LMS write. Idempotent — a second call with the same answer is a no-op.
}
```

Widgets should gate input on `q.locked` and only branch on `q.isLockedCorrect` to render the "already correct" banner.

`Interaction` follows SCORM 2004 4th Edition vocabulary verbatim: `choice`, `true-false`, `fill-in`, `long-fill-in`, `matching`, `sequencing`, `numeric`, `likert`, `performance`, `other`. Each is `{ type, response, correct? }`. Omit `correct` if the runtime should not auto-judge; `useQuestion` reports a `null` correctness flag and your widget renders its own UI.

For `choice` / `sequencing` / `matching`, name your responses with readable ids (`response: ['speed-limit']`) and pass the full option list alongside via `options` (or `optionPairs` for matching). The encoder is then adaptive per export: cmi5 and SCORM 2004 ship the names through unchanged for self-describing traces; SCORM 1.2 maps each name to its position index in `options` so SCORM Cloud's strict validator accepts the value. Omit `options` and SCORM 1.2 falls back to slugging the literal identifier.

```ts
response: () => ({
  type: 'choice',
  response: selected ? [selected] : [],
  correct: ['speed-limit'],
  options: ['stop', 'yield', 'speed-limit', 'merge'],
});
// SCORM 1.2 → student_response: "2"
// SCORM 2004 → learner_response: "speed-limit"
// cmi5      → result.response:    "speed-limit"
```

Matching uses `optionPairs: { left, right }` for the same effect, mapping each pair's `[l, r]` to `"<leftIdx>.<rightIdx>"` on SCORM 1.2.

### `useQuestion`

Register a question widget so the runtime can submit, score, persist, and report it. Returns a `Question` plus standalone-only methods.

- **Inside a quiz**: the parent shell drives submission. The widget calls `setAnswer()` on user input, `commit()` when the answer is final, `setRender(snippet)` once at mount, and reads `locked` / `feedbackVisible` / `answer` to render. `submit()`, `retry()`, `setRender()` etc. degrade to no-ops in the irrelevant mode — the same widget works in both.
- **Standalone**: the widget owns its own Check/Retry. Set `graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string; // unique on the page; LMS interaction id
  graded?: boolean; // standalone only
  response: () => Interaction; // current learner answer; called on each commit() and on submit
  score?: () => number; // standalone-only override (0–100)
  weight?: number; // page-level rollup weight (default 1)
  maxRetries?: number; // standalone retry cap (default Infinity); ignored inside a quiz
  reset?: () => void;
}): Question & {
  submit(): void; // standalone: triggers own check. quiz: no-op (shell drives).
  reset(): void;
  retry(): void; // standalone only; no-op once maxRetries hit or inside a quiz
  readonly canRetry: boolean;
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  setRender(render: unknown): void; // registers the snippet for the parent shell to render
};
```

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
    reset: () => {
      order = ['Mercury', 'Venus', 'Earth', 'Mars'];
    },
  });
</script>

<!-- drag-to-reorder UI bound to `order` -->
{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
{/if}
```

### `useQuiz`

Quiz orchestration hook for any project-supplied `quiz.svelte` (and the built-in `<Quiz>`). A custom shell calls `useQuiz` to drive submission/retry/review. Question widgets call `q.commit()` when their answer is final; that's what triggers the per-question LMS write. `submit()` calls commit for any uncommitted questions as a safety net, then dispatches `tessera-quiz-complete`. **`submit()` is the only sanctioned dispatcher of `tessera-quiz-complete`** — bypassing it means the quiz never marks Completed / Passed / Failed.

```ts
function useQuiz(opts: { element: () => HTMLElement | null }): {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number;
  readonly passingScore: number; // resolved at runtime (config + LMS mastery override)
  readonly attemptCount: number;
  submit(): void; // reports any uncommitted interactions, then dispatches tessera-quiz-complete
  retry(): void;
  startReview(): void;
  exitReview(): void;
  revealFeedback(q: Question): void; // immediate-feedback flow
};
```

Throws when called on a page without `pageConfig.quiz`. Three telemetry-only DOM events also fire (`tessera-quiz-question-answered`, `tessera-quiz-before-submit`, `tessera-quiz-retry`); none of them write to the adapter.

`passingScore` reads the resolved threshold: config's `scoring.passingScore`, overridden when the LMS supplies one (SCORM 2004 `cmi.scaled_passing_score`, cmi5 `masteryScore`). Use this instead of importing `course.config.js` directly — importing the config skips the LMS override.

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
  readonly quizScores: Map<number, number>; // pageIndex → score 0–100
  readonly chunkProgress: Map<number, number>; // pageIndex → highest revealed chunk index
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

const xapi = useXAPI(); // XAPIClient | null
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

| Mode          | `xapi` not set     | `xapi.endpoint: 'lms'`                                  | `xapi: {endpoint, ...}` (explicit)                                |
| ------------- | ------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| **cmi5**      | `useXAPI()` → null | Inherits launch LRS; shares queue with lifecycle stream | Independent publisher; `actor` defaults to launch actor           |
| **scorm12**   | `useXAPI()` → null | **Config error**                                        | Independent publisher; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | **Config error**                                        | Independent publisher; `actor` derived from `cmi.learner_id`      |
| **web**       | `useXAPI()` → null | **Config error**                                        | Independent publisher; `actor` **required** in config             |

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

| Runtime event                                                                                | SCORM 1.2                                                                                                             | SCORM 2004 4th                                                                                                                   | cmi5                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session start                                                                                | `LMSInitialize("")`; read `cmi.suspend_data` and `cmi.interactions._count`                                            | `Initialize("")`; read `cmi.suspend_data` and `cmi.interactions._count`                                                          | `POST` cmi5 `fetch` URL → token; `GET` `LMS.LaunchData` State (§10, → session id + Publisher Activity + launchMode + returnURL + masteryScore + moveOn); `GET` `cmi5LearnerPreferences` Agent Profile (§11); build publisher; send **Initialized**; `GET` `tessera-state` for resume                     |
| State persisted (page visited, bookmark moved, chunk revealed, `usePersistence` write, etc.) | `LMSSetValue("cmi.suspend_data", json)` (microtask-coalesced)                                                         | `SetValue("cmi.suspend_data", json)` (microtask-coalesced)                                                                       | State API `PUT` `tessera-state` document, chained on the publisher queue                                                                                                                                                                                                                                 |
| Graded quiz scored                                                                           | `LMSSetValue("cmi.core.score.raw"\|"min"\|"max", …)` then `LMSSetValue("cmi.core.lesson_status", "passed"\|"failed")` | `SetValue("cmi.score.raw"\|"min"\|"max"\|"scaled", …)` then `SetValue("cmi.success_status", "passed"\|"failed")`                 | **Passed** or **Failed** statement, with `result.score.scaled` and `result.duration` (one-shot per session)                                                                                                                                                                                              |
| Course completion changes                                                                    | Funneled into `cmi.core.lesson_status` (only one field exists)                                                        | `SetValue("cmi.completion_status", "completed"\|"incomplete")`                                                                   | **Completed** statement with `result.completion = true` and `result.duration` (one-shot per session). cmi5 §9.5.1 forbids `score` on Completed — the score rides on the subsequent **Passed**/**Failed** instead.                                                                                        |
| Author marks complete (`completion.mode: "manual"`)                                          | `cmi.core.lesson_status = "completed"` (or `"passed"`/`"failed"` if `requireSuccessStatus` set)                       | `cmi.completion_status = "completed"`; `cmi.success_status = "unknown"` (or `"passed"`/`"failed"` if `requireSuccessStatus` set) | **Completed** statement; **Passed**/**Failed** if `requireSuccessStatus` set                                                                                                                                                                                                                             |
| Question answered (graded or standalone, inside or outside a quiz)                           | `cmi.interactions.{n}.id` / `student_response` / `result` / `time` / `type` (n continues from prior `_count`)         | `cmi.interactions.{n}.id` / `learner_response` / `result` / `timestamp` / `type` (n continues from prior `_count`)               | **Answered** statement; object `${activityId}#${questionId}`, definition `cmi.interaction` + `interactionType`, `result.response`, `result.success`                                                                                                                                                      |
| Resume after reload                                                                          | Read `cmi.suspend_data` on init; manifest is rebuilt from code, not LMS                                               | Read `cmi.suspend_data` on init                                                                                                  | State API `GET` `tessera-state`; lifecycle replays from where the prior session left off                                                                                                                                                                                                                 |
| Author exit / unload                                                                         | `LMSSetValue("cmi.core.exit", "suspend"\|"")`, `LMSCommit("")`, `LMSFinish("")` (queue drained synchronously)         | `SetValue("cmi.exit", "suspend"\|"normal"\|...)`, `Commit("")`, `Terminate("")` (queue drained synchronously)                    | **Terminated** (always last on the wire, cmi5 §9.3.6). Explicit-exit path: `adapter.exit()` drains the queue then redirects to `returnURL` (§10.2.6). No Suspended verb — incomplete exit is signalled by Terminated without a preceding Completed; the LMS handles Abandoned and resume on next launch. |
| Learner identity (xAPI actor synthesis)                                                      | `cmi.core.student_id` + `cmi.core.student_name`                                                                       | `cmi.learner_id` + `cmi.learner_name`                                                                                            | Launch-supplied actor JSON (Identified Agent)                                                                                                                                                                                                                                                            |
| Persistence cap                                                                              | ~4096 chars per spec; many LMSes allow more, but plan for 4 KB                                                        | 64000 chars per spec                                                                                                             | LRS-defined (typically unbounded for State API documents)                                                                                                                                                                                                                                                |
| Score scale exposed to LMS                                                                   | `score.raw` only (0–100)                                                                                              | `score.raw` (0–100) **and** `score.scaled` (0–1)                                                                                 | `result.score.scaled` (0–1)                                                                                                                                                                                                                                                                              |

The SCORM adapter's internal `commit()` (the `LMSCommit` / `Commit` call) is microtask-coalesced — multiple state mutations within one tick collapse to a single API call. cmi5 statements are individual (no batched commit).

### SCORM 1.2 notes

API discovery: walks `window.parent` / `window.opener` up to 10 levels looking for `API`.

**One status field.** `cmi.core.lesson_status` collapses completion and pass/fail. The runtime resolves them by priority: success (`passed` / `failed`) wins when known; otherwise completion (`completed` / `incomplete`) is written. There is no "unknown"; until a graded quiz produces a result, the LMS sees `incomplete`.

**Mastery is Tessera's, not the LMS's.** Pass/fail is computed from `scoring.passingScore`. `cmi.student_data.mastery_score` is read-only for this runtime.

**Interaction encoding (§3.4.7).** Plain `,` items, `.` pairs, `:` ranges (not the bracketed `[,]` 2004 form). `cmi.interactions.n.id` and response/correct identifiers are slugged to `CMIIdentifier` (alphanumeric + underscore, max 250 chars) — raw option text like `"88 Earth days"` becomes `88_Earth_days`, and an id like `q-1` becomes `q_1`, to dodge `405 Incorrect Data Type`. `true-false` writes `t`/`f`. Numeric `correct_responses.n.pattern` is a single CMIDecimal; ranges are dropped (`result` still carries pass/fail).

**Field write order.** `id` → `type` → `correct_responses.0.pattern` → `student_response` → `result` → `time`, matching the spec's `interactions._children` ordering. SCORM Cloud's strict validator rejects `student_response` with the misleading "must be consistent with interaction type" if `correct_responses.0.pattern` hasn't been declared first — the LMS has no expected pattern to validate against. Other LMSes (Moodle, Reload, scorm-again) accept any order, but the spec ordering is the safest.

**Bookmark.** `cmi.core.lesson_location` is written from `SavedState.b` on every `saveState` to surface "Resume from page N" in LMS UIs.

**Not implemented.** No `cmi.objectives.*` writes. No SCORM 1.2 sequencing; `navigation.canAccess` is the only gating layer, and the LMS sees one SCO. SCORM 1.2 `time-out` / `logout` exit values are not emitted.

**Local testing.** Upload `dist/*-scorm12.zip` to [SCORM Cloud](https://cloud.scorm.com) (free tier) or [Reload SCORM Player](https://github.com/reload/reload). Inspect the LMS API call log to confirm `lesson_status` and `cmi.interactions.*` look right.

### SCORM 2004 4th notes

API discovery: `API_1484_11` via the same parent/opener walk.

**Two status fields, both written.** `cmi.completion_status` and `cmi.success_status` are independent. `unknown` is written _explicitly_ when no graded result exists; leaving it null causes some LMSes (notably SCORM Cloud) to roll a null up to `passed` during status rollup.

**LMS-supplied thresholds.** `cmi.scaled_passing_score` (§4.2.4.3) is read on init and exposed via `adapter.getMasteryScore()`. `App.svelte` picks up `masteryScore` and overrides `scoring.passingScore` for the launch — parity with cmi5's launch-time mastery.

**Launch mode (§4.2.1.5).** `cmi.mode` is read on init. In `browse` and `review` launches every learner-record write is silently suppressed (`setScore` / `setCompletionStatus` / `setSuccessStatus` / `setExit` / `setDuration` / `reportInteraction` / `saveState` — including the `cmi.suspend_data` write). Mirrors cmi5's launchMode handling; exposed via `adapter.getLaunchMode()`.

**Interaction encoding (§4.2.7 / Appendix A).** Bracketed delimiters `[,]` / `[.]` / `[:]` (literal text, not regex). Identifiers are passed through unchanged — §4.2.7 / Appendix A's `short_identifier_type` allows any printable, and 2004's `cmi.interactions.n.id` upgraded to `long_identifier_type` (4000 chars). Slugging would only obscure LMS-side reports without buying anything. `cmi.interactions.n.timestamp` is `time(second,10,0)` per §3.3.10.1 / ISO 8601 §5.3.3 — zone-free, second-resolution (`YYYY-MM-DDThh:mm:ss`); SCORM Cloud rejects fractional seconds and `Z` / `±hh:mm` suffixes with 406.

**Bookmark + progress.** `cmi.location` is written from `SavedState.b` on every `saveState`. `cmi.progress_measure = 1` fires on `setCompletionStatus('complete')` so LMS dashboards show 100%.

**Real precision.** All CMIDecimal-like writes (`score.raw`, `score.scaled`, etc.) round through `formatReal107` — SCORM 2004 4E defines them as `real(10,7)`, and `String(1/3)` would otherwise trip 406.

**Not implemented.** `imsss:sequencing` rules are omitted from `imsmanifest.xml` by design. No `cmi.objectives.*`, no `cmi.adl.nav.*` writes.

**Local testing.** SCORM Cloud is the easiest end-to-end check. Moodle, Cornerstone, SuccessFactors, and Canvas (via Rustici Engine) accept `dist/*-scorm2004.zip` directly.

### cmi5 notes

**Launch contract.** The LMS opens the course URL with `endpoint`, `fetch`, `actor` (JSON-encoded Identified Agent), `activityId`, and optionally `registration`. Discovery succeeds when all four required params are present; otherwise `LMSAdapterError`.

**Token fetch is single-use** (cmi5 §6.2). On failure, reload from the LMS to retry. The token is used as a `Basic` credential, not Bearer. If the fetch URL responds with the spec-defined `{"error-code":...,"error-text":...}` shape (§8.2.3 — typically the single-use violation on a refresh), `adapter.init()` throws with the LMS's error-code/text instead of stuffing the JSON blob into the `Basic` credential and 400-spamming the LRS.

**Lifecycle order.** **Initialized** → **Answered** (one per question, as each widget calls `q.commit()`; uncommitted ones flush at submit) → **Completed** → **Passed** / **Failed** → **Terminated** (always last, cmi5 §9.3.6). Completed is one-shot per registration (never re-emitted on resume); Passed/Failed are re-emitted only on a _status transition_ (e.g., a learner who failed in session 1 and passes in session 2 fires a fresh Passed in session 2, but a learner who passed before and resumes does not re-emit). The runtime seeds the adapter at restore time via `seedLifecycle()` so the LMS isn't spammed with duplicates that 403 as "completion status already determined." **Satisfied** and **Suspended** are not emitted by the AU — Satisfied is LMS-only (§9.3.9), and Suspended isn't a cmi5 verb (§9.3 enumerates nine; the LMS handles Abandoned / resume on relaunch).

**Required result fields.** Completed: `completion: true`, `duration` (no `score` — §9.5.1 forbids it). Passed: `success: true`, `duration`, `result.score.scaled` when known (§9.3.4 requires `scaled >= masteryScore` when present). Failed: `success: false`, `duration`, `result.score.scaled` when known (§9.3.5 requires `scaled < masteryScore` when present). Terminated: `duration` (§9.5.4.1). On contradiction the verb is preserved and the score is dropped with a console warning.

**Context per Defined Statement.** Categories: `cmi5` Category Activity on every Defined Statement (§9.6.2.1); plus `moveOn` Category on Completed / Passed / Failed (§9.6.2.2). Extensions: `sessionid` (§9.6.3.1) on every statement (Defined and Allowed) — value sourced from `LMS.LaunchData.contextTemplate` when supplied, else minted UUID. `masteryScore` extension on Passed / Failed only (§9.6.3.2). The full `contextTemplate` from `LMS.LaunchData` is merged in (§9.6.2 makes it the AU's base context; §10.2.1 says AU MUST NOT overwrite template values, so the AU's categories are concatenated and deduped against the template's, never replacing them).

**`LMS.LaunchData` (§10).** Fetched once at init from the State API under `stateId='LMS.LaunchData'`. The AU reads `contextTemplate`, `launchMode`, `returnURL`, and `masteryScore` from it. LaunchData values override anything parsed from the launch URL (§10.2.4 makes LaunchData authoritative). When the document is absent, statements ship without the LMS-supplied Publisher Activity and may be rejected by strict LRSes — a console warning fires.

**Learner Preferences (§11).** `cmi5LearnerPreferences` from the Agent Profile API, fetched _before_ Initialized — strict LRSes (SCORM Cloud) track that the GET happened and reject Initialized otherwise. A 404 here is normal (no preferences set); only the GET itself is required, and the response body is not consumed.

**Launch mode (§10.2.2).** "Normal" launches emit the full lifecycle. "Browse" and "Review" launches emit only Initialized and Terminated — every other Defined Statement is silently suppressed. Exposed via `adapter.getLaunchMode()`.

**Return URL (§10.2.6).** `adapter.exit()` is the explicit-exit path: calls `terminate()`, awaits the publisher queue so Terminated lands before navigation, then `window.location.assign(returnURL)`. The page-unload `terminate()` path can't redirect (the browser is already navigating).

**State persistence.** `tessera-state` document via the State API, keyed by `activityId` + `agent` + `registration?` + `stateId='tessera-state'` (distinct from the LMS-owned `LMS.LaunchData` and `cmi5LearnerPreferences` documents). Writes chain onto the publisher's queue so the suspend payload lands before Terminated.

**Manifest (`cmi5.xml`).** Generated by the plugin: course id + AU id are stable URNs derived from `config.title` (`urn:tessera:{course,au}:<hex>`). `<au>` carries `launchMethod="AnyWindow"` (CourseStructure XSD requires it), `moveOn` (`Completed` for percentage/manual, `CompletedAndPassed` for quiz mode), and `masteryScore` (rounded to 4 decimal places per §10.2.4). The `<url>` is a child element of `<au>`, not an attribute.

**Not implemented.** No multi-AU courses (one course = one AU in v1). No **Waived** or **Abandoned** verbs (LMS-only). No mid-session actor refresh.

**Local testing.** Upload `dist/*-cmi5.zip` to SCORM Cloud and use the cmi5 dispatch URL it generates, the closest free equivalent to a real LMS launch.

### Common adapter behaviour

**Queue + retry.** SCORM adapters serialize every `LMSSetValue` / `LMSCommit` through a sequential queue with exponential-backoff retry on transient errors. Each enqueue carries the cmi key as `context`; retry warnings include the real LMS error code (`GetLastError`), the message (`GetErrorString`), and — when supplied — the verbose diagnostic (`GetDiagnostic`, which SCORM Cloud uses to name the offending element). The give-up log reads e.g. `[cmi.interactions.0.timestamp] (LMS error 406: Data Model Element Type Mismatch — is not a valid time type)`.

**Init / terminate logging.** `Initialize` failures fire a top-level warning that names the LMS error code and notes downstream writes will all 301. Malformed `cmi.suspend_data` and non-numeric `cmi.interactions._count` are logged loudly — the latter is dangerous to silently fall back to 0 (the next session would overwrite prior records). Terminate-path `Commit` / `Terminate` / `LMSFinish` failures route through `callSyncOrWarn` so the last-chance writes aren't silent.

**Unload.** `terminate()` cannot run async retries; the page is going away. SCORM drains the queue synchronously (single attempt per pending op) before `Commit` + `Terminate` / `LMSFinish`. cmi5 marks the publisher unloading and uses `keepalive: true` so the browser does not cancel in-flight statements.

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
  export const pageConfig = { title: 'Match the elements' };
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
      correct: [
        ['Hydrogen', 'H'],
        ['Helium', 'He'],
        ['Lithium', 'Li'],
      ],
    }),
    reset: () => {
      pairs = [];
    },
  });

  function connect(l, r) {
    pairs = [...pairs.filter(([a]) => a !== l), [l, r]];
  }
</script>

<svg
  width="400"
  height="200"
  role="img"
  aria-label="Drag to match elements to their symbols"
>
  <!-- canvas + line-drawing UI calls connect(l, r) on drop -->
</svg>

{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
  {#if q.correct === true}<p>Correct.</p>{/if}
  {#if q.correct === false}<button onclick={() => q.reset()}>Try again</button
    >{/if}
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
    Math.round((progress.visitedPages.size / nav.pages.length) * 100),
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
  <select
    onchange={(e) => nav.goTo(e.currentTarget.value)}
    value={nav.currentPage.slug}
  >
    {#each nav.pages as p}<option value={p.slug}>{p.title}</option>{/each}
  </select>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next →</button>
</nav>

<style>
  .topbar {
    display: flex;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--tessera-border);
  }
  .content {
    max-width: var(--tessera-content-max-width);
    margin: 0 auto;
    padding: 2rem;
  }
  .footer {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--tessera-border);
  }
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

Drop `quiz.svelte` at the project root to replace the built-in `<Quiz>`. The runtime wraps every page with `pageConfig.quiz` in your shell instead of the default. The shell uses only the public `useQuiz()` API; no imports from `tessera-learn/runtime/*`.

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
  <p>
    Question {quiz.questions.findIndex((q) => !q.submitted) + 1} of {quiz
      .questions.length}
  </p>

  {#each quiz.questions as q (q.id)}
    <section data-question-id={q.id}>
      {#if q.render}{@render q.render()}{/if}
    </section>
  {/each}

  {#if quiz.state === 'answering'}
    <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
      >Submit</button
    >
  {:else if quiz.state === 'submitted'}
    <p>You scored {quiz.score}% (pass at {quiz.passingScore}%)</p>
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    <button onclick={() => quiz.startReview()}>Review</button>
  {/if}

  <!-- Children render hidden so widget state survives submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

Always submit through `useQuiz().submit()`. See [Data contract](#data-contract-what-the-lms-sees).

### Recipe 4b: Custom question widget for a custom quiz shell

Companion to Recipe 4. The widget calls `useQuestion()` for a `Question` handle, registers a render snippet for the shell with `setRender`, pushes the learner's answer up with `setAnswer`, calls `commit()` when the answer is final, and reads `locked` / `feedbackVisible` / `answer` to render. No `getContext('tessera-quiz')`, no index tracking — `useQuestion` and `useQuiz` traffic in the same `Question` object.

```svelte
<!-- components/MyChoice.svelte -->
<script>
  import { onMount } from 'svelte';
  import { useQuestion } from 'tessera-learn';

  let { id, prompt, options, correct } = $props();
  let selected = $state(null);

  const q = useQuestion({
    id,
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: [String(correct)],
    }),
    reset: () => {
      selected = null;
    },
  });

  // Register the snippet the shell will render. mode === 'quiz' inside a quiz host;
  // 'standalone' when used outside one. setRender is a no-op in standalone.
  onMount(() => q.setRender(view));

  function pick(i) {
    if (q.locked) return;
    selected = i;
    q.setAnswer(i);
    q.commit();
  }
</script>

{#snippet view()}
  <fieldset disabled={q.locked}>
    <legend>{prompt}</legend>
    {#each options as opt, i}
      {@const chosen = (q.feedbackVisible ? q.answer : selected) === i}
      <label>
        <input type="radio" checked={chosen} onchange={() => pick(i)} />
        {opt}
      </label>
    {/each}
  </fieldset>

  {#if q.feedbackVisible}
    <p>
      {q.answer === correct
        ? 'Correct.'
        : 'The right answer was ' + options[correct] + '.'}
    </p>
  {/if}
{/snippet}

<!-- Render the same snippet inline for standalone use (mode === 'standalone'). -->
{#if q.mode === 'standalone'}
  {@render view()}
  {#if !q.submitted}
    <button disabled={selected === null} onclick={() => q.submit()}
      >Check</button
    >
  {/if}
{/if}
```

Under `feedbackMode: 'immediate'`, the shell calls `quiz.revealFeedback(q)` when it wants the next click to show feedback; that flips `q.feedbackVisible`, which in turn flips `q.locked`. Under `'review'`, feedback only appears after `quiz.submit()` followed by `quiz.startReview()`. Under `'never'`, `feedbackVisible` stays false, but `q.locked` still flips on submit.

### Recipe 5: Graded standalone question

A single inline reflection, not in a `<Quiz>` but `graded: true`, so it counts toward course success. Useful for "must answer to pass" gates without the quiz wrapper.

```svelte
<!-- pages/04-reflection/01-reflect/reflect.svelte -->
<script module>
  export const pageConfig = { title: 'Reflection' };
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
    score: () => (answer.trim().length >= 50 ? 100 : 0),
    reset: () => {
      answer = '';
    },
  });
</script>

<h1>Why does this matter to you?</h1>
<p>At least 50 characters required to pass.</p>

<textarea bind:value={answer} rows="6" disabled={q.submitted}></textarea>
<button
  onclick={() => q.submit()}
  disabled={q.submitted || answer.trim().length < 50}
>
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
  export const pageConfig = { title: 'How it works' };
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
- **`pageConfig` must be a static object literal.** Trailing commas, unquoted keys, and single quotes are fine (JSON5-parseable); variables, function calls, template literals, and computed values are not.
- **Third-party libraries** must be project dependencies in `package.json`.
