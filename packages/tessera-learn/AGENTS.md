# AGENTS.md: Tessera Course Authoring Guide

> **Scope:** authoring courses in a Tessera workspace. In the framework monorepo (where this file is `packages/tessera-learn/AGENTS.md`) these rules do not govern framework source: follow the repo-root `AGENTS.md`, and update this guide when a change alters what it documents.

Tessera is an LMS-tracking runtime for interactive learning content (SCORM 1.2 / SCORM 2004 4e / cmi5 / xAPI 1.0.3 / static web). It owns tracking, progress, completion/success rollup, persistence, and navigation gating. You own the presentation layer.

This is the canonical reference for authoring a Tessera course. Read it before generating or editing course code. You are reading `node_modules/tessera-learn/AGENTS.md`; it updates when you bump `tessera-learn`.

## Hard rules

- **Svelte 5 syntax only.** Runes (`$state`, `$derived`, `$props`, `$effect`), `onclick={...}`, snippets with `{@render ...}`. No `export let`, `on:click`, `<slot>` or `<script context="module">`.
- **Public API only.** Import from `tessera-learn`, never from `tessera-learn/runtime/*`.
- **`pageConfig` and `course.config.js` are static object literals.** Trailing commas, unquoted keys and single quotes are fine (JSON5); variables, shorthand properties, function calls, template literals and computed values are not.
- **No runtime data fetching in pages.** No `fetch()` or dynamic loaders in page components.
- **Third-party libraries** go in the workspace `package.json`.
- **Never edit `node_modules/`.** Use an [extension point](#editing-rules).

## Workflow

1. Edit files under `courses/<name>/`.
2. Run `pnpm validate <course>`. Fix every error, and treat a warning as a defect unless you intend it.
3. Before handing off or exporting, run `pnpm check <course>` (validate, then the axe audit).

`pnpm dev <course>` never exits: run it in the background, or leave it to the user.

## Reference files

This file holds what every task needs. The topics below live in `docs/` beside it. **Read the matching file before starting such a task.** Link paths in this guide are relative to this file: open `docs/scoring.md` as `node_modules/tessera-learn/docs/scoring.md`.

| Task                                                                               | Read                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graded pages, course score weighting, optional pages, pass/fail, manual completion | [`node_modules/tessera-learn/docs/scoring.md`](docs/scoring.md)                                                                                       |
| Custom question widget, quiz shell, layout, navigation or progress UI              | [`node_modules/tessera-learn/docs/hooks.md`](docs/hooks.md), then [`node_modules/tessera-learn/docs/recipes.md`](docs/recipes.md) for worked examples |
| Custom xAPI statements, a second LRS                                               | [`node_modules/tessera-learn/docs/xapi.md`](docs/xapi.md)                                                                                             |
| Export packages, the web CSP, per-LMS behaviour, testing in an LMS                 | [`node_modules/tessera-learn/docs/export.md`](docs/export.md)                                                                                         |
| Updating `tessera-learn` to a newer version                                        | [`node_modules/tessera-learn/docs/updating.md`](docs/updating.md)                                                                                     |

---

## Workspaces

A Tessera project is a **workspace**: one `package.json` and one `node_modules` shared by many courses, plus a `shared/` design system. Each course is a self-contained folder under `courses/`.

```
my-courses/
├── package.json            # the one package: owns tessera-learn, svelte, scripts
├── shared/                 # design system shared across courses (imported as $shared)
│   ├── Button.svelte
│   └── tokens.css
├── courses/
│   ├── starter-course/     # a course = course.config.js, pages/, …
│   └── <next course>/
└── AGENTS.md               # pointer to this guide (workspace root only)
```

Rules:

- **Open the workspace folder**, not an individual course, so the root `AGENTS.md` stays in scope.
- Everything below "Project Structure" describes a single course: the contents of one `courses/<name>/`.
- Name the course on every command. A bare command at the workspace root errors and lists courses; it never picks one.

### `$shared`

`$shared` resolves to the workspace `shared/` directory and is bundled into each course's export. Import from it in any course: `import Button from '$shared/Button.svelte'`, `import '$shared/tokens.css'`.

---

## Commands

From the workspace root:

```bash
pnpm install                            # first time only
pnpm tessera new <name>                 # scaffold courses/<name>/
pnpm tessera duplicate <source> <new>   # copy a course to courses/<new>/ with a fresh id
pnpm dev <course>                       # dev server at http://localhost:5173
pnpm validate <course>                  # static checks only: no server, no bundle
pnpm a11y <course>                      # runtime a11y audit on its own
pnpm check <course>                     # validate, then the a11y audit
pnpm export <course>                    # build + package for export.standard
pnpm export <course> --standard <web|scorm12|scorm2004|cmi5|xapi>   # override it for one build (validate takes it too)
cd courses/<name> && pnpm exec tessera dev   # or cd in and omit the name
```

- Course names: lowercase letters, digits, `-`, `_` and `.`, starting with a letter or digit.
- `new` / `dev` / `export` / `validate` / `a11y` / `check` are **reserved script names** aliasing the `tessera` subcommands. Don't repurpose them. `duplicate` has no script: run it as `pnpm tessera duplicate`.
- `dev` hot-reloads pages, layouts, components and `course.config.js`. It stores progress in `localStorage` whatever `export.standard` is, so clear site data to restart as a new learner.
- `validate` runs the same static checks as `dev`/`export` and exits non-zero on an error.
- After `duplicate`, update the copy's `title` in `course.config.js` (and the heading in its `layout.svelte`, if it kept the scaffolded one).

### What `new` scaffolds

| File                         | Contents                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `course.config.js`           | `title`, a generated `id`, `branding.primaryColor`, free navigation, web export |
| `layout.svelte`              | Custom chrome: header, Previous/Next. No sidebar and no Exit button             |
| `pages/01-getting-started/…` | One section, one lesson, one page, each folder with a `_meta.js`                |
| `styles/custom.css`          | Empty stylesheet for overrides                                                  |

Delete `layout.svelte` to get the default chrome (sidebar, plus an Exit button under an LMS). See [Custom Layouts](docs/recipes.md#custom-layouts).

### Updating the framework

Follow [`node_modules/tessera-learn/docs/updating.md`](docs/updating.md) instead of running `pnpm add tessera-learn@latest` on its own: an update can need workspace and course edits, and can reset learners' saved progress.

### Customising the build (optional)

You never write `vite.config.js`. To extend the build, add `tessera.config.js` to the course folder, beside `course.config.js`. It is a **partial** Vite config (an object, or Vite's function form) merged on top of Tessera's, and applies to that course only; one at the workspace root is ignored. Never scaffolded, never touched by updates.

```js
// courses/<name>/tessera.config.js
export default {
  server: { port: 4000 },
};
```

---

## Project Structure

### Required

```
my-course/
├── course.config.js          # Course configuration
└── pages/                     # at least one section dir with .svelte files
    └── intro/
        └── welcome.svelte
```

`pages/` must contain one or more **section directories**, each with one or more `.svelte` files (directly or in lesson subdirectories).

### Optional

```
my-course/
├── layout.svelte              # Custom chrome (replaces default sidebar/topbar); scaffolded
├── quiz.svelte                # Custom quiz shell (replaces built-in <Quiz>)
├── course.runtime.js          # Runtime hooks: canAccess, xAPI auth/actor resolvers
├── components/                # Course-local components, imported by relative path
├── assets/                    # Images, audio, video (referenced via $assets/)
├── styles/                    # Custom CSS overrides
└── pages/
    └── 01-intro/              # Numeric prefix → controls order
        ├── _meta.js           # Section title; page order
        ├── welcome.svelte     # Page directly in the section ("flat" shape)
        └── 01-getting-started/  # Lesson subdirectory ("nested" shape)
            ├── _meta.js
            └── overview.svelte
```

### Editing rules

- **Edit freely:** `pages/`, `course.config.js`, `course.runtime.js`, `layout.svelte`, `quiz.svelte`, `components/`, `assets/`, `styles/`.
- **Components:** course-local ones go in `components/` and are imported by relative path (`import MyChoice from '../../components/MyChoice.svelte'`). Ones shared across courses go in the workspace `shared/` (`$shared/…`).
- **Never edit `node_modules/`.** Edits there are wiped on the next install. There is no `vite.config.js` to edit.
- To change framework behaviour, use an extension point:

| Need                                           | Use                                          |
| ---------------------------------------------- | -------------------------------------------- |
| New question type / interactive widget         | custom component with the `useQuestion` hook |
| Different course chrome (header, nav)          | `layout.svelte`                              |
| Different quiz UI                              | `quiz.svelte` with the `useQuiz` hook        |
| Styling                                        | `styles/`                                    |
| Navigation, completion, scoring, export target | `course.config.js`                           |
| Custom page access, runtime LRS auth/actor     | `course.runtime.js`                          |

If none fit, surface the limitation instead of patching around it.

### Hierarchy and ordering

- Manifest is always **section → lesson → page**. Files directly in a section folder form one implicit untitled lesson, ordered before the section's lesson subdirectories. Both shapes can coexist.
- Sorting is alphabetical by directory/filename. Numeric prefixes on directories (`01-`, `02-`) set explicit order and are stripped from slugs/titles (`01-getting-started/` → slug `getting-started`, title "Getting Started").
- Page filenames keep their prefix (`01-welcome.svelte` → slug `01-welcome`, title "01 Welcome"), so control page order **within a lesson** with `_meta.js`, not filename prefixes.

### `_meta.js`

Optional in every section and lesson folder; without one the title is the title-cased slug and pages sort alphabetically. **Omit it unless you need an override.**

- `title`: **required when the file exists** (build error without it).
- `pages`: explicit page order. Listed names come first; unlisted `.svelte` files are appended alphabetically with a warning. A listed name with no file is a build error.
- A section's `_meta.js` also orders the pages placed directly in that section.

```js
export default { title: 'How to play', pages: ['welcome', 'objectives'] };
```

---

## Authoring Surfaces

1. **Built-in components**: `Callout`, `Image`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, etc. from `tessera-learn`. Import only what you use.
2. **Hooks**: `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useCourse`. The stable contract between custom widgets and the runtime. See [`node_modules/tessera-learn/docs/hooks.md`](docs/hooks.md).
3. **Custom layout**: `layout.svelte` at the course root replaces the default chrome. See [Custom Layouts](docs/recipes.md#custom-layouts).
4. **Custom quiz shell**: `quiz.svelte` at the course root replaces the quiz UI for every page with `pageConfig.quiz`. See [`useQuiz`](docs/hooks.md#usequiz) and [Recipe 2](docs/recipes.md#recipe-2-custom-quiz-shell-via-quizsvelte).
5. **Custom xAPI**: `useXAPI()` emits your own verbs. See [Custom xAPI](docs/xapi.md#custom-xapi-statements).
6. **Runtime hooks**: `course.runtime.js` at the course root exports `canAccess` and xAPI `auth`/`actor` resolvers. See [Runtime hooks](#runtime-hooks-courseruntimejs).

A custom widget that calls `useQuestion` and emits an `Interaction` is scored, reported, and persisted identically to `<MultipleChoice>`.

---

## Creating Pages

Each page is a `.svelte` file inside a lesson folder; standard HTML works as-is. Import components from `tessera-learn` (`import { Callout, Image } from 'tessera-learn'`).

`pageConfig` is optional. It must be a **static object literal** exported from a `<script module>` block.

```svelte
<script module>
  export const pageConfig = { title: 'Introduction to the Topic' };
</script>

<h1>Introduction to the Topic</h1>
```

| Field         | Type      | Default              | Purpose                                                                                           |
| ------------- | --------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `title`       | `string`  | title-cased filename | Page title (`my-page.svelte` → "My Page")                                                         |
| `quiz`        | `object`  | none                 | Makes the page a quiz page. See [`pageConfig.quiz` fields](#pageconfigquiz-fields)                |
| `graded`      | `boolean` | `false`              | Page counts toward the course score. See [Per-page weighting](docs/scoring.md#per-page-weighting) |
| `required`    | `boolean` | `true`               | Graded pages only. See [Per-page weighting](docs/scoring.md#per-page-weighting)                   |
| `weight`      | `number`  | `1`                  | Graded pages only. See [Per-page weighting](docs/scoring.md#per-page-weighting)                   |
| `completesOn` | `"view"`  | none                 | `completion.mode: "manual"` only. See [Manual completion](docs/scoring.md#manual-completion)      |

An unknown field warns and is ignored. Don't skip heading levels in page markup (`<h2>` then `<h4>` warns).

---

## Component Reference

All components import from `tessera-learn`. Nothing loads automatically. Each is accessible by construction (ARIA roles, keyboard, focus management); you only supply the props below.

### Callout

Styled box; children become the body. Prop `type`: `"info"` (default) | `"warning"` | `"tip"` | `"important"`.

```svelte
<Callout type="warning"><p>Be careful.</p></Callout>
```

### Image

Lazy-loaded, renders as `<figure>`/`<figcaption>`.

| Prop         | Type      | Description                                                           |
| ------------ | --------- | --------------------------------------------------------------------- |
| `src`        | `string`  | Image URL. `$assets/` prefix supported                                |
| `alt`        | `string`  | **Required unless `decorative`.** Alt text                            |
| `decorative` | `boolean` | Ornamental image: empty `alt` + `aria-hidden`. Use _instead of_ `alt` |
| `caption`    | `string`  | Optional caption                                                      |

Rules:

- Every `<Image>` needs exactly one of: meaningful `alt`, or `decorative={true}`. The validator errors if neither is present.
- `decorative` is a boolean: write `decorative` or `decorative={true}`, never `decorative="true"` (a string is rejected).

```svelte
<Image
  src="$assets/diagram.png"
  alt="System architecture diagram"
  caption="Figure 1"
/>
<Image src="$assets/flourish.svg" decorative={true} />
```

### Accordion / AccordionItem

Expandable panels, one open at a time. `AccordionItem` takes a `title` prop; children are the body.

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

Slide viewer; wrap each slide's content in `<CarouselSlide>`.

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
</Carousel>
```

### RevealModal

Modal triggered by interaction. Uses Svelte 5 snippets.

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

### Video / Audio

`Video` is a lazy-loaded YouTube/Vimeo iframe (auto-detected, responsive 16:9) or native `<video>` for direct files; `Audio` is a native player. Both share these props:

| Prop         | Type     | Description                                                                                                                                |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src`        | `string` | URL or `$assets/` path                                                                                                                     |
| `title`      | `string` | **Required.** Accessible label (empty/whitespace rejected)                                                                                 |
| `tracks`     | `array`  | Caption tracks → `<track>`; `{ src, kind?: 'captions' \| 'subtitles', srclang?, label? }`. Native players only (ignored for YouTube/Vimeo) |
| `transcript` | `string` | Transcript in a `<details>`. Load from file via `?raw` import                                                                              |

Captions rule (WCAG 1.2): native video needs `tracks` or `transcript`, an embed needs `transcript` (embeds can't carry `<track>`); the validator warns when `<Audio>` has no `transcript`.

```svelte
<script>
  import intro from '$assets/intro.txt?raw';
</script>

<Video src="https://youtube.com/watch?v=ID" title="Intro" transcript={intro} />
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
<Audio src="$assets/lecture.mp3" title="Lecture 1" transcript={intro} />
```

---

## Quizzes

A quiz page is a normal page with `pageConfig.quiz` set. The runtime wraps it in the resolved quiz shell (built-in `<Quiz>`, or a project `quiz.svelte` if present). Drop question components at the page root, with no `<Quiz>` wrapper.

The built-in `<Quiz>` shows one question at a time (Back / Next / Submit), then a results screen with Retry and Review.

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
  id="planet"
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth', 'Mars']}
  correct={1}
/>

<FillInTheBlank
  id="symbol"
  question="What element has the symbol 'O'?"
  answers="Oxygen"
/>
```

### Rules

- **Pass every required prop**, listed under [Question types](#question-types). A missing one is a build error.
- **Question `id`s are unique within a page, and use only letters, digits and inner underscores** (`planet`, `q1`, `final_2`). SCORM 1.2 rewrites anything else (`q-planet` → `q_planet`) and the validator warns.
- **Omitting `id` derives one from the prompt text**, so two identically worded questions collide: the build errors, and at runtime the second registration is renamed (`q1-2`), which changes its `cmi.interactions` key.
- **Page markup outside the question components renders as an intro.** The built-in `<Quiz>` shows it above the current question and hides it on the results and review screens. Under `<Quiz>` prose cannot be interleaved between questions; a custom shell can (see [Recipe 2c](docs/recipes.md#recipe-2c-inline-layout-prose-between-questions)).
- **Custom widgets register through `useQuestion`; only `useQuiz().submit()` scores the quiz.** Anything else and the LMS sees nothing.

### `pageConfig.quiz` fields

| Field           | Type                                 | Default    | Description                                                                                                                                                                                                              |
| --------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `graded`        | `boolean`                            | `false`    | Whether the score counts toward course success                                                                                                                                                                           |
| `gatesProgress` | `boolean`                            | `false`    | Passing required to access the next page (works in `free` and `sequential`)                                                                                                                                              |
| `maxAttempts`   | `number`                             | `Infinity` | Submissions allowed before Retry stops being offered. Counted in suspend data, so it holds across sessions until the LMS attempt ends ([export](docs/export.md#lms-behaviour)); the recorded score is the best attempt   |
| `feedbackMode`  | `"review" \| "immediate" \| "never"` | `"review"` | `immediate`: the button reads "Submit" and each answer is locked and reported as the learner submits it. `review`: post-submit only. `never`: off                                                                        |
| `retryMode`     | `"full" \| "incorrect-only"`         | `"full"`   | `full` resets every answer on retry; `incorrect-only` keeps already-correct questions locked. On a return visit, a question whose answer did not come back (see [`restored`](docs/hooks.md#usequiz)) is reset either way |

### Per-question weighting

Pass `weight` (default 1; non-positive or non-finite counts as 1) to change how much a question pulls on the page score, inside `<Quiz>` and standalone alike. Page score = `Σ(weight × score) / Σ(weight)`, rounded to 2 decimal places. In a quiz each `score` is 0 or 100; standalone it is what `score()` returns, clamped to 0–100. Weights change the page score only: each question is still reported to the LMS as one pass/fail interaction.

Per-page weighting, optional pages, pass/fail and manual completion are in [`node_modules/tessera-learn/docs/scoring.md`](docs/scoring.md).

### Question types

Props listed before "Optional" are required. Every type also accepts `id`, `weight` (default 1) and `correctFeedback` / `incorrectFeedback` (`string`). Syntax is shown in [Setup](#setup); the complex shapes get an example below.

**MultipleChoice**: `question` `string`, `options` `string[]`, `correct` `number` (the 0-based index into `options`, not the answer text: `correct={1}` is the second option). Optional: `optionFeedback` `string[]`, shown next to each option after checking; the chosen option's entry replaces `correctFeedback` / `incorrectFeedback`.

**FillInTheBlank**: `question` `string`, `answers` `string | string[]` (distinct spellings only). Optional: `caseSensitive` `boolean` (default `false`, so don't list case variants).

**Matching**: `question` `string`, `pairs` `{left, right}[]`. Right column auto-shuffled; click left then right to match (tap on mobile), click a pair to unmatch; all pairs must be correct.

```svelte
<Matching
  question="Match country to capital:"
  pairs={[
    { left: 'France', right: 'Paris' },
    { left: 'Germany', right: 'Berlin' },
  ]}
/>
```

**Sorting**: `question` `string`, `items` `string[]`, `targets` `string[]` (category labels), `correct` `number[]` (parallel to `items`: same length, each entry a 0-based index into `targets`). Drag-and-drop or click-to-place.

```svelte
<Sorting
  question="Sort each animal:"
  items={['Dog', 'Eagle', 'Salmon', 'Cat']}
  targets={['Mammals', 'Birds', 'Fish']}
  correct={[0, 1, 2, 0]}
/>
```

### Standalone questions

All four types work outside `<Quiz>` for inline practice. `Matching` checks the answer as soon as the last pair is matched; `MultipleChoice`, `FillInTheBlank` and `Sorting` show a Check button. All offer Retry after a wrong answer. They accept `maxRetries` (`number`, default `Infinity`), `weight` (`number`, default `1`) and `graded` (`boolean`, default `false`). The answer, the retry count and the full-score lock are saved with the page's progress: a learner who returns sees the question submitted with their answer, an answer that scored 100 stays locked, and `maxRetries` counts across visits until the LMS attempt ends. Practice by default; `graded` makes the answer count toward the page score, which a `graded: true` page needs:

```svelte
<MultipleChoice graded question="..." options={[...]} correct={0} />
```

Inside `<Quiz>` the quiz owns grading, so `graded` is ignored there. For a custom widget, build it with `useQuestion` (see [Recipe 3](docs/recipes.md#recipe-3-graded-standalone-question)).

---

## Assets

Drop files into `assets/`. Reference with `$assets/` in built-in component props (`<Image src="$assets/photo.png" alt="…" />`); in CSS use a relative path (`url('../assets/bg.png')`). External URLs work too. At build the plugin copies `assets/` → `dist/assets/`, so paths resolve the same in dev and the bundle.

### `$assets/` in custom components

`$assets/` is **only** rewritten in two places: ES `import` statements (Vite alias) and the `src` prop of built-in `Image`/`Audio`/`Video`. **Raw HTML attributes are NOT rewritten**: `<img src="$assets/foo.svg">`, `new Audio('$assets/...')`, and JS-built CSS `url()` strings all 404 silently. Pick by use case:

**One-off: ES import (preferred).** Build-time bundling, hashing, fails the build if missing:

```svelte
<script>
  import url from '$assets/diagram.svg?url';
</script>

<img src={url} alt="Diagram" />
```

**Collection chosen at runtime: `import.meta.glob`.** Same build-time guarantees:

```js
const signs = import.meta.glob('$assets/signs/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const url = signs[`/assets/signs/${filename}`]; // look up by full key
```

**A `src` prop that accepts `$assets/` like the built-ins: `resolveAsset(src)`.** Rewrites a leading `$assets/` to `./assets/` and passes other URLs through. No build-time guarantees.

```svelte
<script>
  import { resolveAsset } from 'tessera-learn';
  let { src, alt } = $props();
</script>

<img src={resolveAsset(src)} {alt} />
```

**Pure runtime string (last resort).** No build-time guarantees; only when the filename comes from server data: `` const src = `./assets/signs/${filename}` ``.

---

## Styling

Add `.css` files to `styles/`; they load after framework styles and override them. Theme globally by overriding these custom properties:

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
| `--tessera-success`                            | `#147638`                             |
| `--tessera-error`                              | `#b91c1c`                             |
| `--tessera-warning`                            | `#d97706`                             |
| `--tessera-font-family`                        | `'Inter', system-ui, sans-serif`      |
| `--tessera-font-size-base`                     | `1rem`                                |
| `--tessera-line-height`                        | `1.6`                                 |
| `--tessera-spacing-sm` / `-md` / `-lg` / `-xl` | `0.5rem` / `1rem` / `1.5rem` / `2rem` |
| `--tessera-sidebar-width`                      | `280px`                               |
| `--tessera-content-max-width`                  | `800px`                               |

Feedback text renders in `--tessera-success` / `--tessera-error` on an 8% tint of the same color, laid over `--tessera-bg` or `--tessera-bg-secondary`. An override must keep 4.5:1 contrast against that tint over both backgrounds.

```css
:root {
  --tessera-text: #111827;
  --tessera-content-max-width: 960px;
}
```

**Set the primary color and font in `course.config.js`, not CSS.** `branding.primaryColor` and `branding.fontFamily` are applied as inline styles on `<html>`, so they beat a `:root` rule for `--tessera-primary` (and its `-light` / `-dark` shades) and `--tessera-font-family`. Scaffolded courses set `branding.primaryColor`: change it there, or delete it to control the color from CSS.

---

## `course.config.js`

```js
export default {
  title: 'My Course', // omitted, the build warns and ships "Untitled Course"
  id: 'urn:uuid:…', // unique course identity; scaffolders generate one, keep it
  description: '',
  author: '',
  version: '1.0.0',
  language: 'en', // BCP-47 tag for <html lang>; defaults to "en"
  resume: 'auto', // "auto" (default) restores progress unless page structure changed | "never"

  branding: {
    logo: '', // e.g. "$assets/logo.png"
    primaryColor: '#2563eb',
    fontFamily: 'Inter, sans-serif',
  },

  chrome: 'default', // "default" | "custom" (pages render with no chrome); layout.svelte outranks it

  navigation: {
    mode: 'free', // "free" or "sequential"
  },

  completion: {
    mode: 'percentage', // "percentage" | "quiz" | "manual"
    percentageThreshold: 100, // 0–100 (percentage mode)
    // (manual only) trigger: "page", requireSuccessStatus: "passed" | "failed"
  },

  // optional; omitted, completion.mode implies it
  success: {
    from: 'quiz', // "quiz" | "fixed" | "none"
    // status: "passed" | "failed"   (from: "fixed" only)
  },

  scoring: {
    passingScore: 70, // optional under "manual" (defaults to 0, or 70 when a quiz judges)
  },

  export: {
    standard: 'web', // "web" | "scorm12" | "scorm2004" | "cmi5" | "xapi"
  },

  a11y: {
    level: 'warn', // "warn" (default) | "error"
    standard: 'wcag2aa', // "wcag2a" | "wcag2aa" (default) | "wcag21aa"
    ignore: [], // rule IDs to suppress, e.g. ["tessera/heading-order"]
  },
};
```

### Field behaviour

| Field                           | Behaviour                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | Unique course identity; seeds the web localStorage key and the cmi5/xAPI activity id. Scaffolders mint a `urn:uuid:…`. Missing → falls back to a fixed value (collides across courses) and the build warns. `tessera duplicate` regenerates it.                                                                                                                        |
| `language`                      | Sets `<html lang>` (WCAG 3.1.1). Missing/implausible value warns and falls back to `"en"`                                                                                                                                                                                                                                                                              |
| `resume`                        | `"auto"` (default) restores saved progress, but **discards it when pages were added, removed, reordered or renamed** since the save, or when a `tessera-learn` update changed the save format. `"never"` always starts fresh. Discarded scores and progress are not remapped, so upload a restructured course to the LMS as a _new version_, not an overwrite in place |
| `navigation.mode: "free"`       | All pages accessible except those blocked by gating quizzes                                                                                                                                                                                                                                                                                                            |
| `navigation.mode: "sequential"` | Pages unlock one at a time as each completes: a plain page on view, a quiz page on submit, a `graded: true` page once every graded question on it is answered                                                                                                                                                                                                          |
| `completion.mode: "percentage"` | Completes when `completedPages / totalPages * 100 >= percentageThreshold`. A quiz page counts only once its quiz has been submitted (pass or fail), and a `graded: true` page only once every graded question on it is answered.                                                                                                                                       |
| `completion.mode: "quiz"`       | Completes when the graded average >= `scoring.passingScore`. Needs a required graded page                                                                                                                                                                                                                                                                              |
| `completion.mode: "manual"`     | Completes when an author trigger fires. See [Manual completion](docs/scoring.md#manual-completion)                                                                                                                                                                                                                                                                     |
| `success.from`                  | What judges pass/fail, independent of completion. See [Success criterion](docs/scoring.md#success-criterion)                                                                                                                                                                                                                                                           |
| `a11y.level: "error"`           | Promotes captions/transcript, empty question labels, heading order, contrast, language and Svelte a11y warnings to errors. Missing `alt` and missing media `title` are errors at either level                                                                                                                                                                          |
| `a11y.ignore`                   | Flat list matched literally against every diagnostic rule ID across all tiers (`tessera/…`, `a11y_…`, bare axe IDs). Suppresses a matching diagnostic at any severity, the missing `alt` / `title` errors included                                                                                                                                                     |

### Minimum config

Every field has a default, so `export default { title: "My Course" }` is complete: free nav, full-percentage completion, web export, `<html lang="en">`, `passingScore: 70`. Keep the scaffolded `id` and `language`: the build warns without them.

### Runtime hooks: `course.runtime.js`

`course.config.js` is data only: a function value in it fails the build. Functions go in an optional `course.runtime.js` at the course root, as named exports:

| Export      | Type                                     | Purpose                                                                                                                                 |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `canAccess` | `(ctx: AccessContext) => boolean`        | Custom page access. Replaces the `navigation.mode` preset. See [Custom access rules](#custom-access-rules).                             |
| `xapi`      | `{ [destinationId]: { auth?, actor? } }` | Resolvers for explicit xAPI destinations, keyed by their `id`. See [Configure the destination](docs/xapi.md#configure-the-destination). |

Both exports are optional. `course.config.js` and `course.runtime.js` both ship in the client bundle, so every value in them is public: never put a secret in either.

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), export `canAccess` from `course.runtime.js`. It runs synchronously on every navigation evaluation, so keep it cheap. Here, gate `lesson-5` on a prior quiz score:

```js
// course.runtime.js
import { resolveAccess } from 'tessera-learn';

export function canAccess(ctx) {
  if (!resolveAccess(ctx.config)(ctx)) return false;
  if (ctx.page.slug !== 'lesson-5') return true;
  const i = ctx.manifest.pages.findIndex((p) => p.slug === 'lesson-2-quiz');
  return (ctx.progress.quizScore(i) ?? 0) >= ctx.config.scoring.passingScore;
}
```

`AccessContext` (`ctx`) exposes `pageIndex`, `page`, `manifest`, `progress`, `config`. `canAccess` replaces the preset, so compose with it: `resolveAccess(config)` returns the preset for `navigation.mode`, and `freeAccess` / `sequentialAccess` are re-exported.

Build output, the web export CSP and per-LMS behaviour are in [`node_modules/tessera-learn/docs/export.md`](docs/export.md).

### Validation

The plugin validates on every dev start and build. Errors abort the build and print `[tessera error] ...`; warnings print `[tessera warning] ...` and don't block. `tessera dev` re-validates on save; those errors print and the server keeps running. Run `pnpm validate <course>` to check without building.

---

## Accessibility

Two passes plus components that are accessible by construction.

**Static checks** run inside `validate` / `dev` / `export`, with no setup. They cover: `<Image>` alt-or-`decorative`; `<Video>`/`<Audio>` `title` + captions/transcript; empty question labels; skipped heading levels; `branding.primaryColor` contrast against white; well-formed `language`; and the Svelte compiler's `a11y_*` warnings. Each diagnostic carries a rule ID (`[tessera/image-alt]`, `[a11y_missing_attribute]`), which is what `a11y.ignore` and `a11y.level` match.

**Runtime audit** (`tessera a11y`, or via `pnpm check`) is the opt-in deep pass: builds the course, renders **every** page headless (incl. quiz-gated), runs [axe-core](https://github.com/dequelabs/axe-core), writes `a11y-report.json` (git-ignored), exits non-zero at/above the impact threshold (default `serious`; `--threshold minor` is stricter). It catches what static can't (computed ARIA, focus order, rendered contrast) and uses the web adapter, so it works regardless of `export.standard`. First run auto-installs Chromium.

Ruleset and severity come from the `a11y` block: see [Field behaviour](#field-behaviour).
