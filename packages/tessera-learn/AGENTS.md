# AGENTS.md: Tessera Course Authoring Guide

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
└── AGENTS.md / CLAUDE.md   # pointers to this guide (workspace root only)
```

Rules:

- **Open the workspace folder**, not an individual course, so the root pointer to this guide stays in scope.
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

Delete `layout.svelte` to get the default chrome (sidebar, plus an Exit button under an LMS). See [Custom Layouts](#custom-layouts).

### Updating the framework

`pnpm add tessera-learn@latest` (or `tessera-learn@<version>` to pin). The framework owns the build, reserved scripts and this guide, so a bump needs no reconciling. Your root `CLAUDE.md` / `AGENTS.md` are never overwritten: put workspace standards in their Project notes.

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
2. **Hooks**: `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useCourse`. The stable contract between custom widgets and the runtime.
3. **Custom layout**: `layout.svelte` at the course root replaces the default chrome.
4. **Custom quiz shell**: `quiz.svelte` at the course root replaces the quiz UI for every page with `pageConfig.quiz`.
5. **Custom xAPI**: `useXAPI()` emits your own verbs. See [Custom xAPI](#custom-xapi-statements).
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

| Field         | Type      | Default              | Purpose                                                                            |
| ------------- | --------- | -------------------- | ---------------------------------------------------------------------------------- |
| `title`       | `string`  | title-cased filename | Page title (`my-page.svelte` → "My Page")                                          |
| `quiz`        | `object`  | none                 | Makes the page a quiz page. See [`pageConfig.quiz` fields](#pageconfigquiz-fields) |
| `graded`      | `boolean` | `false`              | Page counts toward the course score. See [Per-page weighting](#per-page-weighting) |
| `required`    | `boolean` | `true`               | Graded pages only. See [Per-page weighting](#per-page-weighting)                   |
| `weight`      | `number`  | `1`                  | Graded pages only. See [Per-page weighting](#per-page-weighting)                   |
| `completesOn` | `"view"`  | none                 | `completion.mode: "manual"` only. See [Manual completion](#manual-completion)      |

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
  answers={['Oxygen']}
/>
```

### Rules

- **Pass every required prop**, listed under [Question types](#question-types). A missing one is a build error.
- **Question `id`s are unique within a page, and use only letters, digits and inner underscores** (`planet`, `q1`, `final_2`). SCORM 1.2 rewrites anything else (`q-planet` → `q_planet`) and the validator warns.
- **Omitting `id` derives one from the prompt text**, so two identically worded questions collide: the build errors, and at runtime the second registration is renamed (`q1-2`), which changes its `cmi.interactions` key.
- **Page markup outside the question components renders as an intro.** The built-in `<Quiz>` shows it above the current question and hides it on the results and review screens. Under `<Quiz>` prose cannot be interleaved between questions; a custom shell can (see [Recipe 2c](#recipe-2c-inline-layout-prose-between-questions)).
- **Custom widgets register through `useQuestion`; only `useQuiz().submit()` scores the quiz.** Anything else and the LMS sees nothing.

### `pageConfig.quiz` fields

| Field           | Type                                 | Default    | Description                                                                                                                                                                                        |
| --------------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graded`        | `boolean`                            | `false`    | Whether the score counts toward course success                                                                                                                                                     |
| `gatesProgress` | `boolean`                            | `false`    | Passing required to access the next page (works in `free` and `sequential`)                                                                                                                        |
| `maxAttempts`   | `number`                             | `Infinity` | Submissions allowed before Retry stops being offered. Counted in suspend data, so it holds across sessions; the recorded score is the best attempt                                                 |
| `feedbackMode`  | `"review" \| "immediate" \| "never"` | `"review"` | `immediate`: the button reads "Submit" and each answer is locked and reported as the learner submits it. `review`: post-submit only. `never`: off                                                  |
| `retryMode`     | `"full" \| "incorrect-only"`         | `"full"`   | `full` resets every answer on retry; `incorrect-only` keeps already-correct questions locked. Answers aren't persisted, so retrying a result restored from saved progress always resets everything |

### Per-question weighting

Pass `weight` (default 1; non-positive or non-finite counts as 1) to change how much a question pulls on the page score, inside `<Quiz>` and standalone alike. Page score = `Σ(weight × score) / Σ(weight)`, rounded to 2 decimal places. In a quiz each `score` is 0 or 100; standalone it is what `score()` returns, clamped to 0–100. Weights change the page score only: each question is still reported to the LMS as one pass/fail interaction.

### Per-page weighting

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

### Question types

Props listed before "Optional" are required. Every type also accepts `id`, `weight` (default 1) and `correctFeedback` / `incorrectFeedback` (`string`). Syntax is shown in [Setup](#setup); the complex shapes get an example below.

**MultipleChoice**: `question` `string`, `options` `string[]`, `correct` `number` (the 0-based index into `options`, not the answer text: `correct={1}` is the second option). Optional: `optionFeedback` `string[]`.

**FillInTheBlank**: `question` `string`, `answers` `string[]` (distinct spellings only). Optional: `caseSensitive` `boolean` (default `false`, so don't list case variants).

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

All four types work outside `<Quiz>` for inline practice. `MultipleChoice` and `Matching` check the answer as soon as it is complete; `FillInTheBlank` and `Sorting` show a Check button. All offer Retry after a wrong answer. They accept `maxRetries` (`number`, default `Infinity`), `weight` (`number`, default `1`) and `graded` (`boolean`, default `false`). Practice by default; `graded` makes the answer count toward the page score, which a `graded: true` page needs. The retry count and the full-score lock reset when the learner leaves the page; a revisit can resubmit and replace the saved score:

```svelte
<MultipleChoice graded question="..." options={[...]} correct={0} />
```

Inside `<Quiz>` the quiz owns grading, so `graded` is ignored there. For a custom widget, build it with `useQuestion` (see [Recipe 3](#recipe-3-graded-standalone-question)).

---

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

---

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
| `completion.mode: "manual"`     | Completes when an author trigger fires. See [Manual completion](#manual-completion)                                                                                                                                                                                                                                                                                    |
| `success.from`                  | What judges pass/fail, independent of completion. See [Success criterion](#success-criterion)                                                                                                                                                                                                                                                                          |
| `a11y.level: "error"`           | Promotes captions/transcript, empty question labels, heading order, contrast, language and Svelte a11y warnings to errors. Missing `alt` and missing media `title` are errors at either level                                                                                                                                                                          |
| `a11y.ignore`                   | Flat list matched literally against every diagnostic rule ID across all tiers (`tessera/…`, `a11y_…`, bare axe IDs). Suppresses a matching diagnostic at any severity, the missing `alt` / `title` errors included                                                                                                                                                     |

### Minimum config

Every field has a default, so `export default { title: "My Course" }` is complete: free nav, full-percentage completion, web export, `<html lang="en">`, `passingScore: 70`. Keep the scaffolded `id` and `language`: the build warns without them.

### Runtime hooks: `course.runtime.js`

`course.config.js` is data only: a function value in it fails the build. Functions go in an optional `course.runtime.js` at the course root, as named exports:

| Export      | Type                                     | Purpose                                                                                                                     |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `canAccess` | `(ctx: AccessContext) => boolean`        | Custom page access. Replaces the `navigation.mode` preset. See [Custom access rules](#custom-access-rules).                 |
| `xapi`      | `{ [destinationId]: { auth?, actor? } }` | Resolvers for explicit xAPI destinations, keyed by their `id`. See [Configure the destination](#configure-the-destination). |

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

### Build output

`pnpm export <course>` writes into the course folder:

| `export.standard` | What ships                                  | Where                     |
| ----------------- | ------------------------------------------- | ------------------------- |
| `web`             | Static site (HTML/CSS/JS + `assets/`)       | `dist/` (any static host) |
| `scorm12`         | SCORM 1.2 package                           | `<title>-<version>.zip`   |
| `scorm2004`       | SCORM 2004 4th Edition package              | `<title>-<version>.zip`   |
| `cmi5`            | cmi5 package (AU + manifest)                | `<title>-<version>.zip`   |
| `xapi`            | xAPI 1.0.3 "Tin Can" package (`tincan.xml`) | `<title>-<version>.zip`   |

`<title>` is the slugified `title` and `<version>` the `version` from `course.config.js` (`my-course-1.0.0.zip`). The name carries no standard, and each packaged export first deletes every `<title>-*.zip` in the course folder.

Upload the zip via your LMS's import flow; drop `dist/` (web) on any static host.

To package one course for several LMSs, export once per `--standard` and move each zip out of the course folder before the next export. An unknown `--standard` value fails before the build runs.

### Web export Content-Security-Policy

Web builds emit a baseline CSP `<meta>` (LMS packages and the dev server don't). It allows any `https:` for images/media/frames/network, but **not** for scripts, styles, or fonts, so a CDN script/stylesheet/font is blocked until you allow its origin. Extend per-directive via `export.csp` (sources are **appended** to the baseline, never replaced):

```js
export: {
  standard: 'web',
  csp: {
    'style-src': ['https://fonts.googleapis.com'],
    'font-src': ['https://fonts.gstatic.com'],
  },
}
```

- `export.csp: false` drops the meta entirely (use when your host sets a CSP header).
- To **tighten** or replace a directive, use a `transformIndexHtml` hook: `export.csp` only adds.
- Ignored unless `standard` is `'web'`.

### Validation

The plugin validates on every dev start and build. Errors abort the build and print `[tessera error] ...`; warnings print `[tessera warning] ...` and don't block. `tessera dev` re-validates on save; those errors print and the server keeps running. Run `pnpm validate <course>` to check without building.

---

## Accessibility

Two passes plus components that are accessible by construction.

**Static checks** run inside `validate` / `dev` / `export`, with no setup. They cover: `<Image>` alt-or-`decorative`; `<Video>`/`<Audio>` `title` + captions/transcript; empty question labels; skipped heading levels; `branding.primaryColor` contrast against white; well-formed `language`; and the Svelte compiler's `a11y_*` warnings. Each diagnostic carries a rule ID (`[tessera/image-alt]`, `[a11y_missing_attribute]`), which is what `a11y.ignore` and `a11y.level` match.

**Runtime audit** (`tessera a11y`, or via `pnpm check`) is the opt-in deep pass: builds the course, renders **every** page headless (incl. quiz-gated), runs [axe-core](https://github.com/dequelabs/axe-core), writes `a11y-report.json` (git-ignored), exits non-zero at/above the impact threshold (default `serious`; `--threshold minor` is stricter). It catches what static can't (computed ARIA, focus order, rendered contrast) and uses the web adapter, so it works regardless of `export.standard`. First run auto-installs Chromium.

Ruleset and severity come from the `a11y` block: see [Field behaviour](#field-behaviour).

---

## Hooks Reference

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

### The `Question` model

`useQuiz()` and `useQuestion()` share the same per-question object: a shell iterates `quiz.questions`, a widget gets its `Question` from `useQuestion()`. No indexes, no `getContext`.

```ts
interface Question {
  readonly id: string;
  readonly submitted: boolean;
  readonly correct: boolean | null; // null while answering, and null on a restored result (see `useQuiz().restored`)
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

For `choice` / `sequencing` / `matching`, name responses with readable ids and pass the full option list via `options` (or `optionPairs` for matching). The encoder adapts per export: cmi5/SCORM 2004 keep the names, SCORM 1.2 maps each to its index in `options` (omit `options` and SCORM 1.2 slugs the literal identifier).

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

### `useQuestion`

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
  maxRetries?: number; // standalone retry cap per mount (default Infinity); ignored inside a quiz
  complete?: () => boolean; // is the answer fully specified? default true
  reset?: () => void;
}): Question & {
  submit(): void; // standalone: own check. quiz: no-op
  reset(): void; // clear the answer; after a standalone submit, same as retry()
  retry(): void; // standalone: no-op unless canRetry. Always a no-op inside a quiz
  readonly canRetry: boolean; // standalone: true after a submit that scored under 100, until maxRetries is hit. A remount starts over.
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  setRender(render: unknown): void;
};
```

See [Recipe 2b](#recipe-2b-custom-question-widget-for-a-custom-quiz-shell) for a full widget and [Recipe 3](#recipe-3-graded-standalone-question) for a graded standalone.

### `useQuiz`

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
  readonly restored: boolean; // results came from saved progress, not this session
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
- **Branch on `restored`.** A result restored from saved progress opens in the `submitted` state with the score and attempt count, but answers aren't persisted: every `q.correct` is `null`, `q.feedbackVisible` is `false`, and `startReview()` is a no-op. Show the score and a Retry button; don't offer Review or a per-question breakdown.
- **Read `passingScore` from this hook**, not from `course.config.js`: an LMS mastery score overrides the config at launch.

### `useNavigation`

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

### `useProgress`

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

### `useCompletion`

Active under `completion.mode: "manual"` only. See [Manual completion](#manual-completion).

```ts
function useCompletion(): {
  markComplete(): void; // idempotent: only the first call per session has an effect
  readonly completionStatus: 'incomplete' | 'complete'; // live, same as useProgress().completionStatus
};
```

### `usePersistence<T>(key)`

Per-widget persistent state, JSON-serializable only: a value that isn't (a `BigInt`, a cycle) lasts the session but is left out of the save, with a console warning. Survives reload on every adapter (`localStorage` / SCORM `cmi.suspend_data` / xAPI State API). Reads sync; writes batched. Keys are namespaced per course. Keep values small: see the cap under [LMS behaviour](#lms-behaviour).

```ts
function usePersistence<T>(key: string): {
  get(): T | null;
  set(value: T): void;
};
```

Usage in [Recipe 1](#recipe-1-custom-draw-a-line-question) (persists partial progress).

### `useCourse`

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

`useXAPI()` is callable anywhere (setup, handlers, async, `.ts` modules). It returns `null` when no LRS is configured, before adapter init resolves, or once the session has ended (Exit or page close): **null-check and degrade gracefully**. The client exposes `sendStatement(statement, options?)`, `getActivityId()`, `getActor()` and `getSessionId()`; the getters read the first destination. The publisher fills in `actor`, `timestamp`, `id`, `context.contextActivities.grouping`, and (cmi5) `context.registration` + `sessionid`; you supply `verb`, optionally `object` (defaults to the activity), `result`, `context`, `attachments`.

### Configure the destination

`config.xapi` is one destination or an array, always explicit (no implicit default). Every explicit destination needs a unique `id`. Pick one of three shapes.

An explicit LRS, with its resolvers in `course.runtime.js`:

```js
// course.config.js
export default {
  // ...
  xapi: {
    id: 'lrs',
    endpoint: 'https://lrs.example.com/xapi/',
    activityId: 'https://example.com/courses/intro-to-x',
  },
};
```

```js
// course.runtime.js: resolvers for destination "lrs"
export const xapi = {
  lrs: {
    auth: () => fetch('/api/lrs-token').then((r) => r.text()),
    actor: () => getCurrentUser(),
  },
};
```

The LMS launch LRS (cmi5 / xapi; ignored under other standards). It takes no other field:

```js
// course.config.js
export default {
  // ...
  xapi: { endpoint: 'lms' },
};
```

A fan-out, with at most one `'lms'` entry:

```js
// course.config.js
export default {
  // ...
  xapi: [
    { endpoint: 'lms' },
    {
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/courses/intro-to-x',
    },
  ],
};
```

| Field   | In `course.config.js`                   | In `course.runtime.js` `xapi[id]`                            |
| ------- | --------------------------------------- | ------------------------------------------------------------ |
| `auth`  | credential string (ships in the bundle) | `() => string \| Promise<string>`, re-invoked once on 401    |
| `actor` | static Agent object                     | `() => Agent \| Promise<Agent>`, resolved once per page load |

- Set each field in one file, not both. `auth` is required in one of them.
- Every `xapi` export key must match an explicit destination `id`. Write the export as an object literal so the build can check the pairing.

Each destination has its own queue, auth resolver, and retry loop. One UUID per `sendStatement` is reused across destinations (idempotent dedupe).

### Per-mode behaviour

| Mode          | `xapi` not set     | `xapi.endpoint: 'lms'`  | `xapi: {endpoint, ...}` (explicit)                      |
| ------------- | ------------------ | ----------------------- | ------------------------------------------------------- |
| **cmi5**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **xapi**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **scorm12**   | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.learner_id`      |
| **web**       | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` **required** (config or resolver)  |

### Gotchas

- **Actor priority:** an author-supplied actor (`xapi.actor` or a `course.runtime.js` resolver) always wins; else cmi5 launch actor; else SCORM-derived from the LMS data model. If the SCORM LMS supplies no learner id, that destination is skipped with a console warning, so `useXAPI()` is null when it was the only one. Override the SCORM-derived `homePage` via `actorAccountHomePage` (required if `activityId` is a non-URL IRI).
- **Auth is Basic-only.** Pass the credential value, not the full header (the publisher prepends `Basic `). For OAuth, return a Basic credential from your `auth` resolver or run a proxy.
- **No static `auth` string in production** (it ships in the bundle and the build warns). Export an `auth` resolver that fetches a server-brokered short-lived token. CORS must allow the served origin.
- **`actor` is resolved once per page load** (no mid-session identity change; reload to switch).
- **Page unload rejects sends.** Once unload begins, `sendStatement` rejects (keeps cmi5 Terminated last). Do end-of-session work in a child component's `onDestroy`, not `beforeunload`.
- **Retry:** 3 attempts, exponential backoff; 5xx/network retry, 4xx short-circuits, 409 treated as success. Opt out per call with `sendStatement(stmt, { retry: false })`.

### `sendStatement` return shape

```ts
const result = await xapi.sendStatement({ verb, object });
// { statementId, statement, destinations: [{ endpoint, ok, status?, error? }, ...] }
```

`destinations[]` lets you handle partial failures under fan-out. The publisher validates only: `verb.id` non-empty, `object.id` non-empty when supplied, `result.score.scaled` in `[-1, 1]` when supplied, and that the statement is JSON-serializable. Everything else passes through; the LRS reports shape errors via `destinations[].error`.

### Not supported

OAuth at the publisher level, statement signing/attachment helpers, offline/IndexedDB queue, State API under SCORM and web, voiding, mid-session actor refresh, group actors.

---

## LMS behaviour

The runtime translates author intent into adapter calls automatically. The author-relevant differences:

| Concern              | SCORM 1.2                                                                                | SCORM 2004 4th                                                 | cmi5 / xapi                          |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| Completion + success | One field (`lesson_status`) with no "unknown"; `passed` and `failed` wait for completion | Two independent fields (`completion_status`, `success_status`) | Completed + Passed/Failed statements |
| Score scale to LMS   | `score.raw` (0–100)                                                                      | `score.raw` (0–100) **and** `score.scaled` (0–1)               | `result.score.scaled` (0–1)          |
| `usePersistence` cap | ~4 KB (plan for 4096 chars)                                                              | 64000 chars                                                    | LRS-defined (typically unbounded)    |
| Resume after reload  | From `cmi.suspend_data`                                                                  | From `cmi.suspend_data`                                        | From `tessera-state` (State API)     |

Author-facing consequences:

- **A failing learner who cannot complete stays `incomplete` on SCORM 1.2**, with the score: under `completion.mode: "quiz"` they never complete, and in any mode a failed `gatesProgress` quiz locks the pages after it. An LMS that rescores against a mastery score on exit records `failed` itself.
- **Keep persisted state small under SCORM 1.2**: it shares the ~4 KB `suspend_data` budget with progress and bookmarks.
- **`scoring.passingScore` is the mastery score.** An LMS-supplied mastery score overrides it at launch under SCORM 1.2, SCORM 2004 and cmi5.
- **A package declares a pass mark** (`adlcp:masteryscore`, `minNormalizedMeasure`, cmi5 `masteryScore`) **only under `completion.mode: "quiz"` with a quiz verdict.** Anywhere else a `scoring.passingScore` you set still gates quiz pages that set `gatesProgress`, still decides the verdict, and scores are still reported, but the LMS gets no threshold of its own to judge them against.
- A failed `adapter.init()` renders a visible "This course can't run here" panel, never a silent degradation.

### Local testing

| Standard  | How to test                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| scorm12   | Upload the exported zip to [SCORM Cloud](https://cloud.scorm.com) (free) or Reload Player  |
| scorm2004 | SCORM Cloud (easiest); also Moodle, Cornerstone, SuccessFactors, Canvas                    |
| cmi5      | Upload the exported zip to SCORM Cloud and use its generated cmi5 dispatch URL             |
| xapi      | Upload the exported zip to SCORM Cloud (imports `tincan.xml`) and launch the generated URL |
| web       | Serve `dist/` from any static host                                                         |

Inspect the LMS API call log to confirm `lesson_status` / `completion_status` / interactions look right.

---

## Custom Layouts

`layout.svelte` at the course root replaces the default chrome. Scaffolded courses ship one: edit it, or delete it to get the default chrome back. The contract: it receives a single `page` snippet prop and renders it where the active page goes; use hooks for everything else.

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

A custom layout gets no Exit button; add one with [`useCourse()`](#usecourse).

To keep most of the default chrome, import `DefaultLayout` from `tessera-learn` and compose around it. With no `layout.svelte`, `chrome: 'custom'` in `course.config.js` renders pages with no chrome at all.

---

## Cookbook

End-to-end recipes exercising the full hooks API. Adapt to taste.

### Recipe 1: Custom "draw a line" question

A standalone practice widget written straight into a page. Emits a `matching` interaction (scored like `<Matching>`); persists partial progress so an interrupted session resumes. Check stays disabled until every pair is drawn. To make a widget that also works inside a quiz, see [Recipe 2b](#recipe-2b-custom-question-widget-for-a-custom-quiz-shell).

```svelte
<!-- pages/05-pairs/01-pairs/draw-pairs.svelte -->
<script module>
  export const pageConfig = { title: 'Match the elements' };
</script>

<script>
  import { useQuestion, usePersistence } from 'tessera-learn';

  const CORRECT = [
    ['Hydrogen', 'H'],
    ['Helium', 'He'],
    ['Lithium', 'Li'],
  ];

  const store = usePersistence('draw-pairs:v1');
  let pairs = $state(store.get() ?? []);
  $effect(() => store.set(pairs));

  const q = useQuestion({
    id: 'drawPairs1',
    response: () => ({ type: 'matching', response: pairs, correct: CORRECT }),
    reset: () => {
      pairs = [];
    },
  });

  function connect(l, r) {
    pairs = [...pairs.filter(([a]) => a !== l), [l, r]];
  }
</script>

<!-- line-drawing UI calls connect(l, r) on drop -->

<button
  onclick={q.submit}
  disabled={q.submitted || pairs.length < CORRECT.length}>Check</button
>
{#if q.correct === true}<p>Correct.</p>{/if}
{#if q.canRetry}<button onclick={q.retry}>Try again</button>{/if}
```

### Recipe 2: Custom quiz shell via `quiz.svelte`

Drop `quiz.svelte` at the course root. It replaces the quiz UI on every quiz page.

```svelte
<!-- quiz.svelte -->
<script>
  import { useQuiz } from 'tessera-learn';

  let { children } = $props();

  const quiz = useQuiz();
  const answered = $derived(
    quiz.questions.filter((q) => q.answerComplete).length,
  );
</script>

<div class="my-quiz">
  {#each quiz.questions as q (q.id)}
    <section data-question-id={q.id}>
      {#if q.render}{@render q.render()}{/if}
    </section>
  {/each}

  {#if quiz.state === 'answering'}
    <p>{answered} of {quiz.questions.length} answered</p>
    <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
      >Submit</button
    >
  {:else if quiz.state === 'submitted'}
    <p>You scored {quiz.score}% (pass at {quiz.passingScore}%)</p>
    {#if quiz.bestScore > quiz.score}<p>Best attempt: {quiz.bestScore}%</p>{/if}
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    {#if !quiz.restored}<button onclick={() => quiz.startReview()}
        >Review</button
      >{/if}
  {:else}
    <button onclick={() => quiz.exitReview()}>Back to results</button>
  {/if}

  <!-- Required: questions register only when children render. Hidden keeps widget state across submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

`children` is the whole page body as one snippet, and built-in widgets render nothing inside it. Two layouts:

| Layout          | `children`       | `q.render()`          | Page prose         |
| --------------- | ---------------- | --------------------- | ------------------ |
| Snippet (above) | rendered hidden  | rendered per question | unavailable        |
| Inline          | rendered visibly | never called          | interleaved freely |

Inline layout needs custom widgets that render their own markup instead of calling `setRender`. Built-in widgets render nothing in that layout.

### Recipe 2b: Custom question widget for a custom quiz shell

The widget calls `useQuestion()`, registers a render snippet with `setRender`, pushes answers up with `setAnswer`, and reads `locked`/`feedbackVisible`/`answer`. It never reports: the shell does.

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
  }
</script>

{#snippet view()}
  <fieldset disabled={q.locked}>
    <legend>{prompt}</legend>
    {#each options as opt, i}
      {@const chosen = (q.feedbackVisible ? q.answer : selected) === i}
      <label>
        <input
          type="radio"
          name={id}
          checked={chosen}
          onchange={() => pick(i)}
        />
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

{#if q.mode === 'standalone'}
  {@render view()}
  {#if !q.submitted}
    <button disabled={selected === null} onclick={q.submit}>Check</button>
  {/if}
{/if}
```

Feedback timing: `feedbackMode: 'immediate'` → shell calls `quiz.revealFeedback(q)`, flipping `feedbackVisible` (and `locked`). `'review'` → after `submit()` + `startReview()`. `'never'` → `feedbackVisible` stays false but `locked` still flips on submit.

### Recipe 2c: Inline layout (prose between questions)

Render `children` visibly, never call `q.render()`, and let widgets render their own markup. Questions then sit in page order, interleaved with the page's prose.

```svelte
<!-- quiz.svelte -->
<div>
  {@render children?.()}
  <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
    >Submit</button
  >
</div>
```

```svelte
<!-- components/InlineChoice.svelte: no setRender, no mode branch -->
<fieldset disabled={q.locked}>
  <legend>{prompt}</legend>
  {#each options as opt, i (i)}
    <label
      ><input
        type="radio"
        name={id}
        checked={selected === i}
        onchange={() => pick(i)}
      />
      {opt}</label
    >
  {/each}
</fieldset>
```

Built-in widgets render nothing in this layout (`QuestionShell` renders inline only when standalone). Mixing is fine in one shell: render `children` visibly **and** `{#if q.render}` the snippet list, and each widget lands in whichever branch it registered for.

### Recipe 3: Graded standalone question

A standalone question (no `<Quiz>`) counts toward course success when built with `graded: true` + a `score()` returning 0–100 on a page that declares `pageConfig.graded: true`; omit `correct` to accept any answer. Course success rolls up across every declared graded page, quiz and standalone pages alike.

```js
const q = useQuestion({
  id: 'whyItMatters',
  graded: true,
  response: () => ({ type: 'long-fill-in', response: answer }),
  score: () => (answer.trim().length >= 50 ? 100 : 0),
  reset: () => {
    answer = '';
  },
});
```

### Recipe 4: Chunked-reveal page with `markChunk`

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
