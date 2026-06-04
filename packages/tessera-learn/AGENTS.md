# AGENTS.md: Tessera Course Authoring Guide

Tessera is an LMS-tracking runtime for interactive learning content (SCORM 1.2 / SCORM 2004 4e / cmi5 / static web). It owns tracking, progress, completion/success rollup, persistence, and navigation gating. You own the presentation layer.

This is the canonical reference for authoring a Tessera course. Read it before generating or editing course code. You are reading `node_modules/tessera-learn/AGENTS.md`; it updates when you bump `tessera-learn`.

---

## Workspaces

A Tessera project is a **workspace**: one `package.json` and one `node_modules` shared by many courses, plus a `shared/` design system. Each course is a self-contained folder under `courses/`.

```
my-courses/
├── package.json            # the one package — owns tessera-learn, svelte, scripts
├── shared/                 # design system shared across courses (imported as $shared)
│   ├── Button.svelte
│   └── tokens.css
├── courses/
│   ├── starter-course/     # a course = course.config.js, pages/, …
│   └── <next course>/
└── AGENTS.md / CLAUDE.md   # pointers to this guide (workspace root only)
```

Rules:

- **Open the workspace folder**, not an individual course — this keeps the guide in scope and `$shared` resolving.
- Everything below "Project Structure" describes a single course: the contents of one `courses/<name>/`.
- Name the course on every command. A bare command at the workspace root errors and lists courses; it never picks one.

### Course commands

```bash
pnpm tessera new <name>                 # scaffold courses/<name>/
pnpm tessera duplicate <source> <new>   # copy a course to courses/<new>/
pnpm tessera dev <name>                 # run a command against a named course
cd courses/<name> && pnpm exec tessera dev   # …or cd in and omit the name
pnpm tessera export <name>              # each course exports independently
```

The scaffolded root scripts (`pnpm dev`, `pnpm export`, …) pass through: `pnpm dev <course>` runs that course; bare `pnpm dev` errors.

### `$shared`

`$shared` resolves to the workspace `shared/` directory and is bundled into each course's export. Import from it in any course:

```svelte
<script>
  import Button from '$shared/Button.svelte';
  import '$shared/tokens.css';
</script>

<Button>Continue</Button>
```

---

## Running the project

From the workspace root (`pnpm`; corepack provisions it). Each command takes the course name:

```bash
pnpm install              # first time only
pnpm dev <course>         # dev server at http://localhost:5173 (Ctrl+C to stop)
pnpm export <course>      # build + package for the LMS standard in course.config.js
pnpm validate <course>    # run validation only — no server, no bundle
pnpm check <course>       # validate, then the runtime a11y audit (axe) over the built course
```

- `dev` hot-reloads pages, layouts, components, and `course.config.js`.
- `validate` runs the same static checks as `dev`/`export` and exits non-zero on failure. Use it as the fast feedback loop after editing.
- `check` runs `validate` then `tessera a11y` (builds, renders every page headless, runs axe-core). First run auto-installs Chromium. See [Accessibility](#accessibility).
- `dev` / `export` / `validate` / `check` are **reserved script names** aliasing the `tessera` subcommands. Don't repurpose them.

### Updating the framework

Plain dependency bump — there is no `create-tessera upgrade`:

```bash
pnpm add tessera-learn@latest      # or @0.1.0 to pin
```

The framework owns the build, the reserved scripts, and this guide, so a bump needs no reconciling. Your root `CLAUDE.md`/`AGENTS.md` point to this guide and aren't overwritten by updates — add your own workspace standards to their Project notes section freely.

### Customising the build (optional)

You never write `vite.config.js`. To extend the build, add `tessera.config.js` at the project root — a **partial** Vite config merged on top of Tessera's. `tesseraPlugin()` and the Svelte compiler stay wired in.

```js
// tessera.config.js
export default {
  server: { port: 4000 },
  resolve: { alias: { $lib: '/src/lib' } },
};
```

It is never scaffolded and never touched by updates.

---

## Project Structure

### Required

```
my-course/
├── course.config.js          # Course configuration
├── package.json
└── pages/                     # at least one section dir with .svelte files
    └── intro/
        └── welcome.svelte
```

`pages/` must contain one or more **section directories**, each with one or more `.svelte` files (directly or in lesson subdirectories).

### Optional

```
my-course/
├── layout.svelte              # Custom chrome (replaces default sidebar/topbar)
├── quiz.svelte                # Custom quiz shell (replaces built-in <Quiz>)
├── assets/                    # Images, audio, video (referenced via $assets/)
├── styles/                    # Custom CSS overrides
├── CLAUDE.md / AGENTS.md      # Pointers to this guide
└── pages/
    └── 01-intro/              # Numeric prefix → controls order
        ├── _meta.js           # Override section title; control page order
        ├── welcome.svelte     # Page directly in the section ("flat" shape)
        └── 01-getting-started/  # Lesson subdirectory ("nested" shape)
            ├── _meta.js
            └── overview.svelte
```

### Editing rules

- **Edit freely:** `pages/`, `course.config.js`, `layout.svelte`, `quiz.svelte`, custom components, `assets/`, `styles/`.
- **Never edit `node_modules/`.** Edits there are git-ignored and wiped on the next install/update. There is no `vite.config.js` to edit.
- To change framework behaviour, use an extension point instead of patching `node_modules/`:

| Need | Use |
| ---- | --- |
| New question type / interactive widget | custom component with the `useQuestion` hook |
| Different course chrome (header, nav) | `layout.svelte` |
| Different quiz UI | `quiz.svelte` with the `useQuiz` hook |
| Styling | `styles/` |
| Navigation, completion, scoring, export target | `course.config.js` |

If none fit, surface the limitation — don't patch around it in `node_modules/`.

### Hierarchy and ordering

- Manifest is always **section → lesson → page**. Files directly in a section folder flatten into one implicit lesson titled after the section. Lesson subdirectories nest. Both shapes can coexist.
- Sorting is alphabetical by directory/filename.
- Numeric prefixes on directories (`01-`, `02-`) set explicit order and are stripped from slugs/titles (`01-getting-started/` → slug `getting-started`, title "Getting Started").
- Control page order **within a lesson** with `_meta.js`, not filename prefixes.

### `_meta.js`

Optional everywhere. Default: titles fall back to the title-cased slug; pages sort alphabetically. **Omit the file when defaults are what you want** (`pages: ["only-page"]` and `title: "Splash"` on `01-splash/` are no-ops).

Use it only for a real override:

```js
// title override (folder name doesn't derive to what you want)
export default { title: 'How to play' }; // folder is `01-intro`
```

```js
// explicit page order — listed pages first, unlisted .svelte appended alphabetically
export default { title: 'Welcome', pages: ['welcome', 'objectives'] };
```

---

## Authoring Surfaces

1. **Built-in components** — `Callout`, `Image`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, etc. from `tessera-learn`. Import only what you use.
2. **Hooks** — `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`. The stable contract between custom widgets and the runtime.
3. **Custom layout** — `layout.svelte` at the project root replaces the default chrome.
4. **Custom quiz shell** — `quiz.svelte` at the project root replaces the quiz UI for every page with `pageConfig.quiz`.
5. **Custom xAPI** — `useXAPI()` emits your own verbs. See [Custom xAPI](#custom-xapi-statements).

A custom widget that calls `useQuestion` and emits an `Interaction` is scored, reported, and persisted identically to `<MultipleChoice>`.

---

## Creating Pages

Each page is a `.svelte` file inside a lesson folder. Standard HTML works as-is.

### Page configuration

`pageConfig` sets the title and configures quizzes. It must be a **static object literal** in a module script block — no variables, function calls, or computed values. Both `<script module>` (Svelte 5) and `<script context="module">` (legacy) parse.

```svelte
<script module>
  export const pageConfig = {
    title: 'Introduction to the Topic',
  };
</script>

<h1>Introduction to the Topic</h1>
```

If `title` is omitted, it derives from the filename: `my-page.svelte` → "My Page".

### Importing components

```svelte
<script>
  import { Callout, Image } from 'tessera-learn';
</script>

<Callout type="info"><p>Helpful information.</p></Callout>
```

---

## Component Reference

All components import from `tessera-learn`. Nothing loads automatically.

### Callout

Styled box. A11y: `role="note"` with type-appropriate `aria-label`. Children become the body.

| Prop   | Type                                          | Default  |
| ------ | --------------------------------------------- | -------- |
| `type` | `"info" \| "warning" \| "tip" \| "important"` | `"info"` |

```svelte
<Callout type="warning"><p>Be careful.</p></Callout>
```

### Image

Lazy-loaded image, renders as `<figure>`/`<figcaption>`.

| Prop         | Type      | Description                                                             |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `src`        | `string`  | Image URL. `$assets/` prefix supported                                  |
| `alt`        | `string`  | **Required unless `decorative`.** Alt text                              |
| `decorative` | `boolean` | Ornamental image — empty `alt` + `aria-hidden`. Use _instead of_ `alt`  |
| `caption`    | `string`  | Optional caption                                                        |

Rules:

- Every `<Image>` needs exactly one of: meaningful `alt`, or `decorative={true}`. The validator errors if neither is present.
- `decorative` is a boolean — write `decorative` or `decorative={true}`, never `decorative="true"` (a string is truthy and rejected).

```svelte
<Image src="$assets/diagram.png" alt="System architecture diagram" caption="Figure 1" />
<Image src="$assets/flourish.svg" decorative={true} />
```

### Accordion / AccordionItem

Expandable panels, one open at a time. A11y: `aria-expanded`, `aria-controls`, `role="region"`, Enter/Space.

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

Slide viewer. A11y: `role="region"`, `aria-roledescription="carousel"`, arrow keys, swipe.

```svelte
<Carousel>
  <CarouselSlide>
    <h3>Step 1</h3>
    <p>Plan.</p>
  </CarouselSlide>
  <CarouselSlide>
    <h3>Step 2</h3>
    <p>Build.</p>
  </CarouselSlide>
</Carousel>
```

### RevealModal

Modal triggered by interaction. Uses Svelte 5 snippets. A11y: `role="dialog"`, `aria-modal`, focus trap, Escape to close.

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

| Prop         | Type     | Description                                                                                   |
| ------------ | -------- | --------------------------------------------------------------------------------------------- |
| `src`        | `string` | Video URL or `$assets/` path                                                                  |
| `title`      | `string` | **Required.** Accessible label (empty/whitespace rejected)                                    |
| `tracks`     | `array`  | Caption tracks for **native** video → `<track>`. Ignored for YouTube/Vimeo                     |
| `transcript` | `string` | Transcript in a `<details>` below the player. Load from file via `?raw` import (see example)   |

Captions rule (WCAG 1.2): native video needs `tracks` or `transcript`; an embed needs `transcript` (embeds can't carry `<track>` files). Each `tracks` entry is `{ src, kind?: 'captions' | 'subtitles', srclang?, label? }`.

```svelte
<script>
  import intro from '$assets/intro.txt?raw';
</script>

<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Intro" transcript={intro} />
<Video
  src="$assets/demo.mp4"
  title="Demo"
  tracks={[{ src: '$assets/demo.en.vtt', kind: 'captions', srclang: 'en', label: 'English' }]}
/>
```

### Audio

Native player. A11y: `aria-label` from title.

| Prop         | Type     | Description                                              |
| ------------ | -------- | -------------------------------------------------------- |
| `src`        | `string` | Audio URL or `$assets/` path                             |
| `title`      | `string` | **Required.** Accessible label                           |
| `tracks`     | `array`  | Caption tracks → `<track>` (same shape as `Video`)       |
| `transcript` | `string` | Transcript in a `<details>` (load from file via `?raw`)  |

Transcript rule (WCAG 1.2.1): the validator warns when `<Audio>` has no `transcript`.

```svelte
<script>
  import lecture from '$assets/lecture-01.txt?raw';
</script>

<Audio src="$assets/lecture-01.mp3" title="Lecture 1" transcript={lecture} />
```

---

## Quizzes

A quiz page is a normal page with `pageConfig.quiz` set. The runtime wraps it in the resolved quiz shell (built-in `<Quiz>`, or a project `quiz.svelte` if present). Drop question components at the page root — no `<Quiz>` wrapper.

### Setup

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

<FillInTheBlank id="q-symbol" question="What element has the symbol 'O'?" answers={['Oxygen']} />
```

### Rules

- **`correct` is a 0-based index, not the answer text.** `correct={1}` is the second option; it must be in range for `options`.
- **All required props present:** `MultipleChoice` needs `question` + `options` + `correct`; `FillInTheBlank` needs `question` + `answers`; `Matching` needs `question` + `pairs`; `Sorting` needs `question` + `items` + `targets` + `correct`.
- **`Sorting.correct` is a parallel array to `items`** — same length, each entry a valid index into `targets`.
- **Question `id`s are unique within a page.** Duplicates collide in `cmi.interactions`.
- **No `<Quiz>` wrapper.** Pages with `pageConfig.quiz` are wrapped automatically.
- **Custom widgets register through `useQuestion` and submit through `useQuiz().submit()`** — otherwise the LMS sees nothing. See [Data contract](#data-contract).

### Data contract

Whatever quiz UI you build, the LMS sees the same `cmi.interactions` as the built-in. Every question registered through `useQuestion` reports the moment its widget calls `q.commit()`; `useQuiz().submit()` commits any that haven't, as a safety net. **Bypass `useQuestion`/`useQuiz` and the quiz reports nothing.**

### `pageConfig.quiz` fields

| Field           | Type                                 | Default    | Description                                                                                  |
| --------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------- |
| `graded`        | `boolean`                            | `false`    | Whether the score counts toward course success                                              |
| `gatesProgress` | `boolean`                            | `false`    | Passing required to access the next page (works in `free` and `sequential`)                  |
| `maxAttempts`   | `number`                             | `Infinity` | Max attempts                                                                                 |
| `feedbackMode`  | `"review" \| "immediate" \| "never"` | `"review"` | `immediate`: after `revealFeedback(q)`, locks the answer. `review`: post-submit only. `never`: off |
| `retryMode`     | `"full" \| "incorrect-only"`         | `"full"`   | `full` resets every answer on retry; `incorrect-only` keeps already-correct questions locked |

### Per-question weighting

Pass `weight` (default 1; non-positive treated as 1) to change how much a question pulls on the page score. Works identically inside `<Quiz>` and standalone.

```svelte
<MultipleChoice id="q-easy" weight={1} ... />
<MultipleChoice id="q-hard" weight={3} ... />
```

Page score = weighted-correct percentage: `Σ(weight × correct) / Σ(weight) × 100`, rounded. Weights affect only the page-level `cmi.core.score.raw` rollup, not `cmi.interactions.*` (each question is still one pass/fail interaction).

### Question types

#### MultipleChoice

| Prop                | Type       | Description                          |
| ------------------- | ---------- | ------------------------------------ |
| `question`          | `string`   | Prompt                               |
| `options`           | `string[]` | Answer options                       |
| `correct`           | `number`   | Index of correct option (0-based)    |
| `correctFeedback`   | `string`   | Optional                             |
| `incorrectFeedback` | `string`   | Optional                             |
| `optionFeedback`    | `string[]` | Optional per-option feedback         |
| `weight`            | `number`   | Page-level rollup weight (default 1) |

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

`answers` only needs distinct spellings; `caseSensitive: false` handles case variants.

```svelte
<FillInTheBlank question="What element has the symbol 'O'?" answers={['Oxygen']} />
```

#### Matching

Right column auto-shuffled. Click left then right to match (tap on mobile); click a pair to unmatch. All pairs must be correct.

| Prop       | Type                              | Description                          |
| ---------- | --------------------------------- | ------------------------------------ |
| `question` | `string`                          | Prompt                               |
| `pairs`    | `{left: string, right: string}[]` | Correct pairs                        |
| `weight`   | `number`                          | Page-level rollup weight (default 1) |

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

| Prop       | Type       | Description                                          |
| ---------- | ---------- | ---------------------------------------------------- |
| `question` | `string`   | Prompt                                               |
| `items`    | `string[]` | Items to sort                                        |
| `targets`  | `string[]` | Category labels                                      |
| `correct`  | `number[]` | Per item, the index of its correct target (parallel) |
| `weight`   | `number`   | Page-level rollup weight (default 1)                 |

```svelte
<Sorting
  question="Sort each animal:"
  items={['Dog', 'Eagle', 'Salmon', 'Cat', 'Robin', 'Trout']}
  targets={['Mammals', 'Birds', 'Fish']}
  correct={[0, 1, 2, 0, 1, 2]}
/>
```

### Standalone questions

All four types work outside `<Quiz>` for inline practice and render their own Check/Retry.

| Prop         | Type     | Default    | Description                       |
| ------------ | -------- | ---------- | --------------------------------- |
| `maxRetries` | `number` | `Infinity` | Max retries for standalone        |
| `weight`     | `number` | `1`        | Per-question page-level weight    |

```svelte
<MultipleChoice
  question="What color is the sky on a clear day?"
  options={['Red', 'Blue', 'Green']}
  correct={1}
  maxRetries={2}
/>
```

Standalone questions are not graded by default. To grade one, build it with `useQuestion`. See [Recipe 5](#recipe-5-graded-standalone-question).

---

## Manual completion

Use `completion.mode: "manual"` when the author owns the completion moment (e.g. reading the final page, or a "click to acknowledge" button) rather than a quiz score or page-visit ratio.

Both triggers below are always active under manual mode. First-to-fire wins; subsequent calls are idempotent.

### Trigger A: page frontmatter

Declare `completesOn: "view"` (the only v1 value) on any page. Completion fires the moment that page renders.

```svelte
<script module>
  export const pageConfig = { title: "You're done", completesOn: 'view' };
</script>

<h1>Thanks for completing the briefing.</h1>
```

### Trigger B: runtime hook

```svelte
<script>
  import { useCompletion } from 'tessera-learn';
  const { markComplete, completionStatus } = useCompletion();
</script>

<button onclick={() => markComplete()} disabled={completionStatus === 'complete'}>
  I acknowledge
</button>

{#if completionStatus === 'complete'}
  <p>Recorded. You may now close this window.</p>
{/if}
```

`markComplete()` composes with any event (modal close, video-ended, timer). Outside `mode: "manual"` it is a no-op with a one-shot dev warning — safe to leave in shared components.

### `completion.trigger` (build-time check)

Optional. Set to `"page"` to fail the build when no page declares `completesOn: "view"`. Both triggers still work regardless.

```js
completion: { mode: "manual", trigger: "page" }
```

When omitted, the dev runtime warns once after 60s if completion hasn't fired.

### Success status

By default `successStatus` stays `"unknown"` under manual. For completion **and** an automatic pass:

```js
completion: { mode: "manual", requireSuccessStatus: "passed" }  // or "failed"
```

| Adapter        | `markComplete()` with no `requireSuccessStatus`                          |
| -------------- | ----------------------------------------------------------------------- |
| SCORM 1.2      | `cmi.core.lesson_status = "completed"`                                  |
| SCORM 2004 4th | `cmi.completion_status = "completed"`, `cmi.success_status = "unknown"` |
| cmi5           | **Completed** statement (no Passed / Failed)                            |
| web            | `localStorage` only                                                     |

With `requireSuccessStatus: "passed"`: SCORM 1.2 → `lesson_status = "passed"`, SCORM 2004 → `success_status = "passed"`, cmi5 → **Passed** alongside **Completed**.

### Quizzes under manual mode

A graded quiz reports its score to the gradebook but does **not** drive completion/success — `markComplete()`/`completesOn` does. The build warns. Set `graded: false` if that's not what you want.

### Non-goals

- Combining manual + quiz/percentage rules → use `useCompletion()` in a custom `$effect`.
- Per-learner conditional completion in config → do it in a component with `useCompletion()`.
- Marking a course incomplete after completion. Completion is monotonic; re-marks are ignored.

---

## Assets

Drop files into `assets/`. Reference with `$assets/` in built-in component props:

```svelte
<Image src="$assets/photo.png" alt="Photo" />
<Video src="$assets/demo.mp4" title="Demo" />
```

In CSS, use a relative path from `styles/`:

```css
.bg {
  background-image: url('../assets/bg.png');
}
```

External URLs work too. At build the plugin copies `assets/` → `dist/assets/`, so `$assets/foo.png` resolves the same in dev and the shipped bundle.

### `$assets/` in custom components

`$assets/` is **only** rewritten in two places: ES `import` statements (Vite alias) and the `src` prop of built-in `Image`/`Audio`/`Video`. **Raw HTML attributes are NOT rewritten** — `<img src="$assets/foo.svg">`, `new Audio('$assets/...')`, and CSS `url()` strings built in JS all 404 with no warning.

Pick by use case:

**One-off — ES import (preferred).** Build-time bundling, hashing, fails the build if missing:

```svelte
<script>
  import url from '$assets/diagram.svg?url';
</script>

<img src={url} alt="Diagram" />
```

**Collection chosen at runtime — `import.meta.glob`.** Same build-time guarantees:

```js
const signs = import.meta.glob('$assets/signs/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const url = signs[`/assets/signs/${filename}`]; // look up by full key
```

**Pure runtime string (last resort).** No build-time guarantees; use only when the filename comes from server data:

```js
const src = `./assets/signs/${filename}`;
```

---

## Styling

Add `.css` files to `styles/`. They load after framework styles and override them.

Override these custom properties to theme globally:

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

For the common case, set `branding.primaryColor` and `branding.fontFamily` in `course.config.js` instead of writing CSS.

---

## `course.config.js`

```js
export default {
  title: 'My Course', // required — the only field with no default
  description: '',
  author: '',
  version: '1.0.0',
  language: 'en', // BCP-47 tag for <html lang>; defaults to "en"

  branding: {
    logo: '', // e.g. "$assets/logo.png"
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

  a11y: {
    level: 'warn', // "warn" (default) | "error" — "error" makes promotable a11y rules block the build
    standard: 'wcag2aa', // "wcag2a" | "wcag2aa" (default) | "wcag21aa" — axe ruleset
    ignore: [], // rule IDs to suppress, e.g. ["tessera/heading-order", "color-contrast"]
  },
};
```

### Field behaviour

| Field                       | Behaviour                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `language`                  | Sets `<html lang>` (WCAG 3.1.1). Missing/implausible value warns and falls back to `"en"`          |
| `navigation.mode: "free"`   | All pages accessible except those blocked by gating quizzes                                         |
| `navigation.mode: "sequential"` | Pages unlock one at a time as each completes                                                    |
| `completion.mode: "percentage"` | Completes when `visitedPages / totalPages * 100 >= percentageThreshold`                          |
| `completion.mode: "quiz"`   | Completes when graded quiz average >= `scoring.passingScore`                                        |
| `completion.mode: "manual"` | Completes when an author trigger fires. See [Manual completion](#manual-completion)                 |
| `a11y.level: "error"`       | Promotes captions/transcript, heading order, contrast, language, Svelte a11y warnings to errors. Hard errors (missing `alt`, missing media `title`) always block regardless |
| `a11y.ignore`               | Flat list matched literally against every diagnostic rule ID across all tiers (`tessera/…`, `a11y_…`, bare axe IDs) |

### Minimum config

Every field except `title` has a default, so `export default { title: "My Course" }` is complete (free nav, full-percentage completion, web export, `<html lang="en">`). Effective defaults:

```js
{
  title: "Untitled Course",
  language: "en",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
}
```

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), supply `navigation.canAccess`. It runs synchronously on every navigation evaluation — keep it cheap.

```js
import { sequentialAccess } from 'tessera-learn';

export default {
  navigation: {
    mode: 'sequential',
    canAccess: (ctx) => {
      if (!sequentialAccess(ctx)) return false;
      if (ctx.page.slug === 'lesson-5') {
        const i = ctx.manifest.pages.findIndex((p) => p.slug === 'lesson-2-quiz');
        return (ctx.progress.quizScores.get(i) ?? 0) >= ctx.config.scoring.passingScore;
      }
      return true;
    },
  },
};
```

`AccessContext` exposes `pageIndex`, `page`, `manifest`, `progress`, `config`. Presets `freeAccess` and `sequentialAccess` are re-exported for composition. `resolveAccess(config)` returns the predicate the runtime would use (custom `canAccess` if set, else the matching preset) — use it to wrap rather than replace.

### Build output

`pnpm export <course>` writes:

| `export.standard` | What ships                            | Where                                    |
| ----------------- | ------------------------------------- | ---------------------------------------- |
| `web`             | Static site (HTML/CSS/JS + `assets/`) | `dist/` (any static host)                |
| `scorm12`         | SCORM 1.2 package                     | `dist/<course>-scorm12.zip`              |
| `scorm2004`       | SCORM 2004 4th Edition package        | `dist/<course>-scorm2004.zip`            |
| `cmi5`            | cmi5 package (AU + manifest)          | `dist/<course>-cmi5.zip`                 |

Upload the LMS zips via your LMS's import flow. Drop `dist/` (web) on Netlify, GitHub Pages, S3, or any static host.

### Validation

The plugin validates on every dev start and build (page syntax, manifest shape, `pageConfig`, question components, asset references, data-contract bypass). Errors abort the build and print `[tessera error] ...`; warnings print `[tessera warning] ...` and don't block. Run `pnpm validate <course>` to check without building.

---

## Accessibility

Two passes plus components that are accessible by construction.

**Static checks** run inside `validate` / `dev` / `export` — no setup. They cover: `<Image>` alt-or-`decorative`; `<Video>`/`<Audio>` `title` + captions/transcript; empty question labels; skipped heading levels; `branding.primaryColor` contrast against white; well-formed `language`; and the Svelte compiler's `a11y_*` warnings. Each diagnostic carries a rule ID (`[tessera/image-alt]`, `[a11y_missing_attribute]`) — that ID is what `a11y.ignore` and `a11y.level` match.

**Runtime audit** (`tessera a11y`) is the opt-in deep pass. Run it directly or via `pnpm check <course>`:

```bash
pnpm exec tessera a11y                   # audit (threshold: serious)
pnpm exec tessera a11y --threshold minor # stricter
pnpm exec tessera a11y --build           # force a fresh build first
```

It builds the course, renders **every** page headless (including quiz-gated pages), runs [axe-core](https://github.com/dequelabs/axe-core), writes `a11y-report.json` (git-ignored), and exits non-zero on any violation at/above the impact threshold (default `serious`). It catches what a static scan can't: computed ARIA, focus order, rendered contrast. First run auto-installs Chromium. It uses the web adapter, so it works regardless of `export.standard`.

Ruleset/severity come from the `a11y` block (`standard`, `ignore`). Hard errors (missing `alt`, missing media `title`) always block; everything else is a warning unless `a11y.level: "error"`.

---

## Hooks Reference

Six hooks plus one helper. Each is synchronous, must be called during component setup inside a Tessera course, and throws if called outside the runtime.

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

### The `Question` model

`useQuiz()` and `useQuestion()` traffic in the same per-question object. A shell iterates `quiz.questions`; a widget gets its `Question` from `useQuestion()`. No indexes, no `getContext`.

```ts
interface Question {
  readonly id: string;
  readonly submitted: boolean;
  readonly correct: boolean | null;
  readonly answer: unknown;
  readonly feedbackVisible: boolean;
  readonly locked: boolean; // input read-only: submitted OR feedbackVisible OR isLockedCorrect
  readonly isLockedCorrect: boolean; // narrow case: retry policy preserved this as already-correct
  readonly render: unknown; // snippet the widget registered; shell calls {@render q.render()}
  setAnswer(answer: unknown): void;
  commit(): void; // mark answer final; triggers the per-question LMS write. Idempotent.
}
```

Gate input on `q.locked`; branch on `q.isLockedCorrect` only to render the "already correct" banner.

`Interaction` uses SCORM 2004 vocabulary: `choice`, `true-false`, `fill-in`, `long-fill-in`, `matching`, `sequencing`, `numeric`, `likert`, `performance`, `other`. Each is `{ type, response, correct? }`. Omit `correct` to skip auto-judging (`useQuestion` reports `null` correctness; your widget renders its own UI).

For `choice` / `sequencing` / `matching`, name responses with readable ids and pass the full option list via `options` (or `optionPairs` for matching). The encoder adapts per export: cmi5/SCORM 2004 keep the names; SCORM 1.2 maps each to its index in `options`. Omit `options` and SCORM 1.2 slugs the literal identifier.

```ts
response: () => ({
  type: 'choice',
  response: selected ? [selected] : [],
  correct: ['speed-limit'],
  options: ['stop', 'yield', 'speed-limit', 'merge'],
});
// SCORM 1.2 → "2"   SCORM 2004 → "speed-limit"   cmi5 → "speed-limit"
```

### `useQuestion`

Register a question widget so the runtime can submit, score, persist, and report it. Returns a `Question` plus standalone-only methods.

- **Inside a quiz:** the shell drives submission. The widget calls `setAnswer()` on input, `commit()` when final, `setRender(snippet)` once at mount, and reads `locked`/`feedbackVisible`/`answer`. `submit()`/`retry()` are no-ops here.
- **Standalone:** the widget owns Check/Retry. Set `graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string; // unique on the page; LMS interaction id
  graded?: boolean; // standalone only
  response: () => Interaction; // current answer; called on each commit() and on submit
  score?: () => number; // standalone-only override (0–100)
  weight?: number; // page-level rollup weight (default 1)
  maxRetries?: number; // standalone retry cap (default Infinity); ignored inside a quiz
  reset?: () => void;
}): Question & {
  submit(): void; // standalone: own check. quiz: no-op
  reset(): void;
  retry(): void; // standalone only; no-op once maxRetries hit or inside a quiz
  readonly canRetry: boolean;
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  setRender(render: unknown): void;
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

{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
{/if}
```

### `useQuiz`

Orchestration hook for any `quiz.svelte` (and the built-in `<Quiz>`). Question widgets call `q.commit()` when final; that triggers the per-question LMS write. `submit()` commits any uncommitted questions, then dispatches `tessera-quiz-complete`. **`submit()` is the only sanctioned dispatcher of `tessera-quiz-complete`** — bypass it and the quiz never marks Completed/Passed/Failed.

```ts
function useQuiz(opts: { element: () => HTMLElement | null }): {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number;
  readonly passingScore: number; // resolved at runtime (config + LMS mastery override)
  readonly attemptCount: number;
  submit(): void;
  retry(): void;
  startReview(): void;
  exitReview(): void;
  revealFeedback(q: Question): void; // immediate-feedback flow
};
```

Throws on a page without `pageConfig.quiz`. Use `passingScore` from here, not `course.config.js` directly — importing the config skips the LMS mastery override (SCORM 2004 `cmi.scaled_passing_score`, cmi5 `masteryScore`).

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

Active under `completion.mode: "manual"`; in any other mode `markComplete()` is a no-op with a one-shot dev warning. See [Manual completion](#manual-completion).

```ts
function useCompletion(): {
  markComplete(): void; // idempotent — only the first call per session has an effect
  readonly completionStatus: 'incomplete' | 'complete';
};
```

### `usePersistence<T>(key)`

Per-widget persistent state, JSON-serializable only. Survives reload on every adapter (`localStorage` / SCORM `cmi.suspend_data` / xAPI State API). Reads sync; writes batched. Keys are namespaced per course. Mind the SCORM 1.2 ~4 KB suspend-data cap (see [LMS behaviour](#lms-behaviour)).

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

Pure helper. Returns `true`, `false`, or `null` (when the interaction has no `correct`).

```ts
function isCorrect(i: Interaction): boolean | null;
```

---

## Custom xAPI statements

The lifecycle stream (Initialized / Completed / Passed / Failed / Terminated; `cmi.*` writes under SCORM) is sent automatically. To emit your own verbs, use `useXAPI()`:

```ts
import { useXAPI } from 'tessera-learn';

const xapi = useXAPI(); // XAPIClient | null
xapi?.sendStatement({
  verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
  object: { id: `${xapi.getActivityId()}#diagram-1` },
});
```

`useXAPI()` is a plain function callable anywhere (setup, handlers, async, `.ts` modules). It returns `null` when no LRS is configured or before adapter init resolves — **null-check and degrade gracefully**. The publisher fills in `actor`, `timestamp`, `id`, `context.contextActivities.grouping`, and (cmi5) `context.registration` + `sessionid`. You supply `verb`, optionally `object` (defaults to the activity), `result`, `context`, `attachments`.

### Configure the destination

`config.xapi` is one destination or an array. Always declared explicitly — no implicit default.

```js
xapi: {
  endpoint: 'https://lrs.example.com/xapi/',
  auth: () => fetch('/api/lrs-token').then(r => r.text()),
  actor: () => getCurrentUser(),     // or a static Agent object
  activityId: 'https://example.com/courses/intro-to-x',
}

// cmi5 only: inherit the LMS launch LRS:
xapi: { endpoint: 'lms' }

// Fan out (at most one 'lms' entry):
xapi: [
  { endpoint: 'lms' },
  { endpoint: 'https://analytics.example.com/xapi/', auth, actor, activityId },
]
```

Each destination has its own queue, auth resolver, and retry loop. One UUID per `sendStatement` is reused across destinations (idempotent dedupe).

### Per-mode behaviour

| Mode          | `xapi` not set     | `xapi.endpoint: 'lms'`        | `xapi: {endpoint, ...}` (explicit)                |
| ------------- | ------------------ | ----------------------------- | ------------------------------------------------- |
| **cmi5**      | `useXAPI()` → null | Inherits launch LRS           | Independent publisher; `actor` defaults to launch actor |
| **scorm12**   | `useXAPI()` → null | **Config error**              | Independent; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | **Config error**              | Independent; `actor` derived from `cmi.learner_id` |
| **web**       | `useXAPI()` → null | **Config error**              | Independent; `actor` **required** in config        |

### Gotchas

- **Actor priority:** author-supplied `xapi.actor` always wins; else cmi5 launch actor; else SCORM-derived from the LMS data model; else error. Override the SCORM-derived `homePage` via `actorAccountHomePage` (required if `activityId` is a non-URL IRI).
- **Auth is Basic-only.** Pass the credential value, not the full header (the publisher prepends `Basic `). For OAuth, return a Basic credential from your `auth` function or run a proxy.
- **Never ship a static `auth` string on web** — the bundle is public. Use a function that fetches a server-brokered short-lived token. CORS must allow the served origin.
- **`actor` is required on web export** and resolved once per page-load (no mid-session identity change in v1 — reload to switch).
- **Page unload rejects sends.** Once unload begins, `sendStatement` rejects (keeps cmi5 Terminated last). Do end-of-session work in a child component's `onDestroy`, not `beforeunload`.
- **Retry:** 3 attempts, exponential backoff; 5xx/network retry, 4xx short-circuits, 409 treated as success. Opt out per call with `sendStatement(stmt, { retry: false })`.

### `sendStatement` return shape

```ts
const result = await xapi.sendStatement({ verb, object });
// { statementId, statement, destinations: [{ endpoint, ok, status?, error? }, ...] }
```

`destinations[]` lets you handle partial failures under fan-out. The publisher validates only: `verb.id` non-empty, `object.id` non-empty when supplied, `result.score.scaled` in `[-1, 1]` when supplied. Everything else passes through; the LRS reports shape errors via `destinations[].error`.

### Not in v1

OAuth at the publisher level, statement signing/attachment helpers, offline/IndexedDB queue, State API for non-cmi5 modes, voiding, mid-session actor refresh, group actors.

---

## LMS behaviour

The runtime translates author intent into adapter calls automatically; you don't write any of it. The author-relevant differences:

| Concern                | SCORM 1.2                                  | SCORM 2004 4th                          | cmi5                                  |
| ---------------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------- |
| Completion + success   | One field (`lesson_status`); no "unknown" — success wins when known, else completion | Two independent fields (`completion_status`, `success_status`) | Completed + Passed/Failed statements |
| Score scale to LMS     | `score.raw` (0–100)                        | `score.raw` (0–100) **and** `score.scaled` (0–1) | `result.score.scaled` (0–1)    |
| `usePersistence` cap   | ~4 KB (plan for 4096 chars)                | 64000 chars                             | LRS-defined (typically unbounded)     |
| Resume after reload    | From `cmi.suspend_data`                    | From `cmi.suspend_data`                 | From `tessera-state` (State API)      |

Author-facing consequences:

- **Keep persisted state small under SCORM 1.2** — it shares the ~4 KB `suspend_data` budget with progress and bookmarks.
- **SCORM 1.2 shows `incomplete` until a graded quiz produces a result** (no "unknown" status). Pass/fail uses `scoring.passingScore`, not the LMS's mastery field.
- **SCORM 2004 / cmi5 honor an LMS-supplied mastery score** at launch, overriding `scoring.passingScore`. Read it via `useQuiz().passingScore`.
- A failed `adapter.init()` renders a visible "This course can't run here" panel — never a silent degradation.

### Local testing

| Standard   | How to test                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| scorm12    | Upload `dist/*-scorm12.zip` to [SCORM Cloud](https://cloud.scorm.com) (free) or Reload Player |
| scorm2004  | SCORM Cloud (easiest); also Moodle, Cornerstone, SuccessFactors, Canvas                        |
| cmi5       | Upload `dist/*-cmi5.zip` to SCORM Cloud and use its generated cmi5 dispatch URL                |
| web        | Serve `dist/` from any static host                                                            |

Inspect the LMS API call log to confirm `lesson_status` / `completion_status` / interactions look right.

---

## Custom Layouts

Drop `layout.svelte` at the project root to replace the default chrome. The contract: it receives a single `page` snippet prop and renders it where the active page goes. Use hooks for everything else.

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

To keep most of the default chrome, import `DefaultLayout` from `tessera-learn` and compose around it.

---

## Cookbook

End-to-end recipes exercising the full hooks API. Adapt to taste.

### Recipe 1: Custom "draw a line" question

Emits a `matching` interaction (scored like `<Matching>`); persists partial progress so an interrupted session resumes.

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

Horizontal topbar with breadcrumb + progress %.

```svelte
<!-- layout.svelte -->
<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();

  const percent = $derived(Math.round((progress.visitedPages.size / nav.pages.length) * 100));
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

Lock lesson 5 until lessons 1–3 are visited. Composes with `sequentialAccess`.

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

Drop `quiz.svelte` at the project root. Use only the public `useQuiz()` API; no imports from `tessera-learn/runtime/*`.

```svelte
<!-- quiz.svelte -->
<script>
  import { useQuiz } from 'tessera-learn';

  let { children } = $props();
  let host;

  const quiz = useQuiz({ element: () => host });
</script>

<div bind:this={host} class="my-quiz">
  <p>
    Question {quiz.questions.findIndex((q) => !q.submitted) + 1} of {quiz.questions.length}
  </p>

  {#each quiz.questions as q (q.id)}
    <section data-question-id={q.id}>
      {#if q.render}{@render q.render()}{/if}
    </section>
  {/each}

  {#if quiz.state === 'answering'}
    <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}>Submit</button>
  {:else if quiz.state === 'submitted'}
    <p>You scored {quiz.score}% (pass at {quiz.passingScore}%)</p>
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    <button onclick={() => quiz.startReview()}>Review</button>
  {/if}

  <!-- Children render hidden so widget state survives submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

Always submit through `useQuiz().submit()`.

### Recipe 4b: Custom question widget for a custom quiz shell

The widget calls `useQuestion()`, registers a render snippet with `setRender`, pushes answers up with `setAnswer`, calls `commit()` when final, and reads `locked`/`feedbackVisible`/`answer`.

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

  onMount(() => q.setRender(view)); // no-op in standalone mode

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
    <p>{q.answer === correct ? 'Correct.' : 'The right answer was ' + options[correct] + '.'}</p>
  {/if}
{/snippet}

{#if q.mode === 'standalone'}
  {@render view()}
  {#if !q.submitted}
    <button disabled={selected === null} onclick={() => q.submit()}>Check</button>
  {/if}
{/if}
```

Feedback timing: `feedbackMode: 'immediate'` → shell calls `quiz.revealFeedback(q)`, flipping `feedbackVisible` (and `locked`). `'review'` → after `submit()` + `startReview()`. `'never'` → `feedbackVisible` stays false but `locked` still flips on submit.

### Recipe 5: Graded standalone question

A single inline reflection, not in a `<Quiz>` but `graded: true`, so it counts toward course success.

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
<button onclick={() => q.submit()} disabled={q.submitted || answer.trim().length < 50}>
  Submit
</button>

{#if q.submitted}<p>Thanks. Your reflection has been recorded.</p>{/if}
```

Course success rolls up across all graded items: quizzes and standalones alike.

### Recipe 6: Chunked-reveal page with `markChunk`

Reveals sections one at a time. `markChunk(pageIndex, chunkIndex)` records the highest revealed chunk so the page resumes mid-scroll on reload.

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

### Recipe 7: Persisted UI state with `usePersistence`

Any JSON-serialisable value can survive reload — here, a sidebar collapsed toggle.

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

Keys are namespaced per course, so two courses on the same LMS don't collide.

---

## Constraints

- **No runtime data fetching in pages.** Page content is static; no `fetch()` or dynamic loaders in page components.
- **Public API only.** Import from `tessera-learn`. Never from `tessera-learn/runtime/*` — those paths are internal and may change.
- **`pageConfig` must be a static object literal.** Trailing commas, unquoted keys, single quotes are fine (JSON5); variables, function calls, template literals, and computed values are not.
- **Third-party libraries** must be project dependencies in `package.json`.
