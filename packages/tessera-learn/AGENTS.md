# AGENTS.md: Tessera Course Authoring Guide

Tessera is an LMS-tracking runtime for interactive learning content (SCORM 1.2 / SCORM 2004 4e / cmi5 / xAPI 1.0.3 / static web). It owns tracking, progress, completion/success rollup, persistence, and navigation gating. You own the presentation layer.

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

`$shared` resolves to the workspace `shared/` directory and is bundled into each course's export. Import from it in any course: `import Button from '$shared/Button.svelte'`, `import '$shared/tokens.css'`.

---

## Running the project

From the workspace root. Each command takes the course name:

```bash
pnpm install              # first time only
pnpm dev <course>         # dev server at http://localhost:5173 (Ctrl+C to stop)
pnpm export <course>      # build + package for the LMS standard in course.config.js
pnpm export <course> --standard <web|scorm12|scorm2004|cmi5|xapi>   # override that standard for this build
pnpm validate <course>    # run validation only — no server, no bundle (also takes --standard)
pnpm a11y <course>        # runtime a11y audit on its own (the audit half of check)
pnpm check <course>       # validate, then the runtime a11y audit (axe) over the built course
```

- `dev` hot-reloads pages, layouts, components, and `course.config.js`.
- `validate` runs the same static checks as `dev`/`export`, exits non-zero on failure — the fast feedback loop.
- `check` runs `validate` then `tessera a11y` (builds, renders every page headless, runs axe-core; first run auto-installs Chromium). See [Accessibility](#accessibility).
- `new` / `dev` / `export` / `validate` / `a11y` / `check` are **reserved script names** aliasing the `tessera` subcommands. Don't repurpose them.

### Updating the framework

Plain dependency bump — there is no `create-tessera upgrade`: `pnpm add tessera-learn@latest` (or `@0.1.0` to pin). The framework owns the build, reserved scripts, and this guide, so a bump needs no reconciling; your root `CLAUDE.md`/`AGENTS.md` aren't overwritten — add workspace standards to their Project notes freely.

### Customising the build (optional)

You never write `vite.config.js`. To extend the build, add `tessera.config.js` at the project root — a **partial** Vite config merged on top of Tessera's (`tesseraPlugin()` and the Svelte compiler stay wired in). Never scaffolded, never touched by updates.

```js
// tessera.config.js
export default {
  server: { port: 4000 },
  resolve: { alias: { $lib: '/src/lib' } },
};
```

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

| Need                                           | Use                                          |
| ---------------------------------------------- | -------------------------------------------- |
| New question type / interactive widget         | custom component with the `useQuestion` hook |
| Different course chrome (header, nav)          | `layout.svelte`                              |
| Different quiz UI                              | `quiz.svelte` with the `useQuiz` hook        |
| Styling                                        | `styles/`                                    |
| Navigation, completion, scoring, export target | `course.config.js`                           |

If none fit, surface the limitation — don't patch around it in `node_modules/`.

### Hierarchy and ordering

- Manifest is always **section → lesson → page**. Files directly in a section folder flatten into one implicit lesson titled after the section; lesson subdirectories nest. Both shapes can coexist.
- Sorting is alphabetical by directory/filename. Numeric prefixes on directories (`01-`, `02-`) set explicit order and are stripped from slugs/titles (`01-getting-started/` → slug `getting-started`, title "Getting Started").
- Control page order **within a lesson** with `_meta.js`, not filename prefixes.

### `_meta.js`

Optional everywhere; defaults are title-cased slug + alphabetical pages. **Omit it unless you need a real override.** Two fields: `title` (folder name doesn't derive to what you want) and `pages` (explicit order — listed first, unlisted `.svelte` appended alphabetically):

```js
export default { title: 'How to play', pages: ['welcome', 'objectives'] };
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

Each page is a `.svelte` file inside a lesson folder; standard HTML works as-is. Import components from `tessera-learn` (`import { Callout, Image } from 'tessera-learn'`).

`pageConfig` sets the title and configures quizzes. It must be a **static object literal** in a module script block — no variables, function calls, or computed values. Both `<script module>` (Svelte 5) and `<script context="module">` (legacy) parse. If `title` is omitted it derives from the filename (`my-page.svelte` → "My Page").

```svelte
<script module>
  export const pageConfig = { title: 'Introduction to the Topic' };
</script>

<h1>Introduction to the Topic</h1>
```

---

## Component Reference

All components import from `tessera-learn`. Nothing loads automatically. Each is accessible by construction (ARIA roles, keyboard, focus management) — you only supply the props below.

### Callout

Styled box; children become the body. Prop `type`: `"info"` (default) | `"warning"` | `"tip"` | `"important"`.

```svelte
<Callout type="warning"><p>Be careful.</p></Callout>
```

### Image

Lazy-loaded, renders as `<figure>`/`<figcaption>`.

| Prop         | Type      | Description                                                            |
| ------------ | --------- | ---------------------------------------------------------------------- |
| `src`        | `string`  | Image URL. `$assets/` prefix supported                                 |
| `alt`        | `string`  | **Required unless `decorative`.** Alt text                             |
| `decorative` | `boolean` | Ornamental image — empty `alt` + `aria-hidden`. Use _instead of_ `alt` |
| `caption`    | `string`  | Optional caption                                                       |

Rules:

- Every `<Image>` needs exactly one of: meaningful `alt`, or `decorative={true}`. The validator errors if neither is present.
- `decorative` is a boolean — write `decorative` or `decorative={true}`, never `decorative="true"` (a string is truthy and rejected).

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

`Video` is a YouTube/Vimeo iframe (auto-detected, responsive 16:9) or native `<video>` for direct files; `Audio` is a native player. Both lazy-load and share these props:

| Prop         | Type     | Description                                                                                                                        |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | `string` | URL or `$assets/` path                                                                                                             |
| `title`      | `string` | **Required.** Accessible label (empty/whitespace rejected)                                                                         |
| `tracks`     | `array`  | Caption tracks → `<track>`; `{ src, kind?: 'captions' \| 'subtitles', srclang?, label? }`. Native only (ignored for YouTube/Vimeo) |
| `transcript` | `string` | Transcript in a `<details>`. Load from file via `?raw` import                                                                      |

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

<FillInTheBlank
  id="q-symbol"
  question="What element has the symbol 'O'?"
  answers={['Oxygen']}
/>
```

### Rules

- **`correct` is a 0-based index, not the answer text.** `correct={1}` is the second option; it must be in range for `options`.
- **All required props present:** `MultipleChoice` needs `question` + `options` + `correct`; `FillInTheBlank` needs `question` + `answers`; `Matching` needs `question` + `pairs`; `Sorting` needs `question` + `items` + `targets` + `correct`.
- **`Sorting.correct` is a parallel array to `items`** — same length, each entry a valid index into `targets`.
- **Question `id`s are unique within a page.** Duplicates collide in `cmi.interactions`.
- **No `<Quiz>` wrapper.** Pages with `pageConfig.quiz` are wrapped automatically.
- **Page markup outside the question components renders as an intro.** The built-in `<Quiz>` puts it above the first question and hides it on the results screen. Built-in widgets render only through the snippet they register, so under `<Quiz>` prose cannot be interleaved between questions; a custom shell can (see [Recipe 2](#recipe-2-custom-quiz-shell-via-quizsvelte)).
- **Custom widgets register through `useQuestion` and submit through `useQuiz().submit()`** — otherwise the LMS sees nothing.

### `pageConfig.quiz` fields

| Field           | Type                                 | Default    | Description                                                                                                                                                                                        |
| --------------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graded`        | `boolean`                            | `false`    | Whether the score counts toward course success                                                                                                                                                     |
| `gatesProgress` | `boolean`                            | `false`    | Passing required to access the next page (works in `free` and `sequential`)                                                                                                                        |
| `maxAttempts`   | `number`                             | `Infinity` | Submissions allowed before Retry stops being offered. Counted in suspend data, so it holds across sessions; the recorded score is the best attempt                                                 |
| `feedbackMode`  | `"review" \| "immediate" \| "never"` | `"review"` | `immediate`: the button reads "Submit" and each answer is locked and reported as the learner submits it. `review`: post-submit only. `never`: off                                                  |
| `retryMode`     | `"full" \| "incorrect-only"`         | `"full"`   | `full` resets every answer on retry; `incorrect-only` keeps already-correct questions locked. Answers aren't persisted, so retrying a result restored from saved progress always resets everything |

### Per-question weighting

Pass `weight` (default 1; non-positive treated as 1) to change how much a question pulls on the page score; works identically inside `<Quiz>` and standalone. Page score = `Σ(weight × correct) / Σ(weight) × 100`, rounded. Weights affect only the page-level `cmi.core.score.raw` rollup, not `cmi.interactions.*` (each question is still one pass/fail interaction).

### Question types

Every type also accepts `weight` (page-level rollup, default 1). Syntax is shown in [Setup](#setup); the complex shapes get an example below.

**MultipleChoice** — `question` `string`, `options` `string[]`, `correct` `number` (0-based index). Optional: `correctFeedback` / `incorrectFeedback` `string`, `optionFeedback` `string[]`.

**FillInTheBlank** — `question` `string`, `answers` `string[]` (distinct spellings only), `caseSensitive` `boolean` (default `false`, handles case variants).

**Matching** — `question` `string`, `pairs` `{left, right}[]`. Right column auto-shuffled; click left then right to match (tap on mobile), click a pair to unmatch; all pairs must be correct.

```svelte
<Matching
  question="Match country to capital:"
  pairs={[
    { left: 'France', right: 'Paris' },
    { left: 'Germany', right: 'Berlin' },
  ]}
/>
```

**Sorting** — `question` `string`, `items` `string[]`, `targets` `string[]` (category labels), `correct` `number[]` (parallel to `items`; each entry an index into `targets`). Drag-and-drop or click-to-place.

```svelte
<Sorting
  question="Sort each animal:"
  items={['Dog', 'Eagle', 'Salmon', 'Cat']}
  targets={['Mammals', 'Birds', 'Fish']}
  correct={[0, 1, 2, 0]}
/>
```

### Standalone questions

All four types work outside `<Quiz>` for inline practice, rendering their own Check/Retry. They accept `maxRetries` (`number`, default `Infinity`). Not graded by default — to grade one, build it with `useQuestion` (see [Recipe 3](#recipe-3-graded-standalone-question)).

---

## Manual completion

Use `completion.mode: "manual"` when the author owns the completion moment (final page read, "click to acknowledge") rather than a quiz score or visit ratio. Two triggers, both always active; first-to-fire wins, re-marks are idempotent (completion is monotonic — you can't un-complete):

- **Page frontmatter** — `completesOn: "view"` (only v1 value) in a page's `pageConfig`; fires when that page renders.
- **Runtime hook** — `useCompletion().markComplete()`, composed with any event (modal close, video-ended, timer). Outside manual mode it's a no-op with a one-shot dev warning, so it's safe in shared components.

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

By default `successStatus` stays `"unknown"`. Set `requireSuccessStatus: "passed"` (or `"failed"`) for an automatic pass alongside completion:

| Adapter        | `markComplete()`, default                                       | with `requireSuccessStatus: "passed"` |
| -------------- | --------------------------------------------------------------- | ------------------------------------- |
| SCORM 1.2      | `lesson_status = "completed"`                                   | `lesson_status = "passed"`            |
| SCORM 2004 4th | `completion_status = "completed"`, `success_status = "unknown"` | `success_status = "passed"`           |
| cmi5           | **Completed** (no Passed/Failed)                                | **Passed** alongside **Completed**    |
| xapi           | **Completed** (no Passed/Failed)                                | **Passed** alongside **Completed**    |
| web            | `localStorage` only                                             | `localStorage` only                   |

### Rules and non-goals

- A graded quiz reports its score but does **not** drive completion/success under manual — `markComplete()`/`completesOn` does (the build warns; set `graded: false` to silence).
- Combining manual + quiz/percentage rules, or per-learner conditional completion → use `useCompletion()` in a custom `$effect`/component, not config.

---

## Assets

Drop files into `assets/`. Reference with `$assets/` in built-in component props (`<Image src="$assets/photo.png" alt="…" />`); in CSS use a relative path (`url('../assets/bg.png')`). External URLs work too. At build the plugin copies `assets/` → `dist/assets/`, so paths resolve the same in dev and the bundle.

### `$assets/` in custom components

`$assets/` is **only** rewritten in two places: ES `import` statements (Vite alias) and the `src` prop of built-in `Image`/`Audio`/`Video`. **Raw HTML attributes are NOT rewritten** — `<img src="$assets/foo.svg">`, `new Audio('$assets/...')`, and JS-built CSS `url()` strings all 404 silently. Pick by use case:

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
  id: 'urn:uuid:…', // unique course identity; scaffolders generate one — keep it
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

  navigation: {
    mode: 'free', // "free" or "sequential"
  },

  completion: {
    mode: 'percentage', // "percentage" | "quiz" | "manual"
    percentageThreshold: 100, // 0–100 (percentage mode)
    // (manual only) trigger: "page", requireSuccessStatus: "passed" | "failed"
  },

  scoring: {
    passingScore: 70, // optional under "manual" (defaults to 0)
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

| Field                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | Unique course identity; seeds the web localStorage key and the cmi5/xAPI activity id. Scaffolders mint a `urn:uuid:…`. Missing → falls back to a fixed value (collides across courses) and the build warns. `tessera duplicate` regenerates it.                                                                                                                                                                                                                                                 |
| `language`                      | Sets `<html lang>` (WCAG 3.1.1). Missing/implausible value warns and falls back to `"en"`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `resume`                        | `"auto"` (default) restores saved progress, but **discards it when the page structure changed** (pages added/removed/reordered/renamed) since it was saved. `"never"` always starts fresh. Re-uploading a changed course to an LMS: upload as a _new version_/registration, not overwrite-in-place, so learners get a clean attempt — `"auto"` still protects learners if your LMS overwrites in place, but old-structure scores/progress are dropped by design (they can't be safely remapped) |
| `navigation.mode: "free"`       | All pages accessible except those blocked by gating quizzes                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `navigation.mode: "sequential"` | Pages unlock one at a time as each completes                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `completion.mode: "percentage"` | Completes when `visitedPages / totalPages * 100 >= percentageThreshold`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `completion.mode: "quiz"`       | Completes when graded quiz average >= `scoring.passingScore`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `completion.mode: "manual"`     | Completes when an author trigger fires. See [Manual completion](#manual-completion)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `a11y.level: "error"`           | Promotes captions/transcript, heading order, contrast, language, Svelte a11y warnings to errors. Hard errors (missing `alt`, missing media `title`) always block regardless                                                                                                                                                                                                                                                                                                                     |
| `a11y.ignore`                   | Flat list matched literally against every diagnostic rule ID across all tiers (`tessera/…`, `a11y_…`, bare axe IDs)                                                                                                                                                                                                                                                                                                                                                                             |

### Minimum config

Every field except `title` has a default, so `export default { title: "My Course" }` is complete: free nav, full-percentage completion, web export, `<html lang="en">`, `passingScore: 70`.

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), supply `navigation.canAccess` (with `mode`). It runs synchronously on every navigation evaluation — keep it cheap. Here, gate `lesson-5` on a prior quiz score:

```js
import { sequentialAccess } from 'tessera-learn';

canAccess: (ctx) => {
  if (!sequentialAccess(ctx)) return false;
  if (ctx.page.slug !== 'lesson-5') return true;
  const i = ctx.manifest.pages.findIndex((p) => p.slug === 'lesson-2-quiz');
  return (
    (ctx.progress.quizScores.get(i) ?? 0) >= ctx.config.scoring.passingScore
  );
};
```

`AccessContext` (`ctx`) exposes `pageIndex`, `page`, `manifest`, `progress`, `config`. Presets `freeAccess` / `sequentialAccess` are re-exported for composition; `resolveAccess(config)` returns the predicate the runtime would use (custom `canAccess` if set, else the matching preset) — use it to wrap rather than replace.

### Build output

`pnpm export <course>` writes:

| `export.standard` | What ships                                  | Where                         |
| ----------------- | ------------------------------------------- | ----------------------------- |
| `web`             | Static site (HTML/CSS/JS + `assets/`)       | `dist/` (any static host)     |
| `scorm12`         | SCORM 1.2 package                           | `dist/<course>-scorm12.zip`   |
| `scorm2004`       | SCORM 2004 4th Edition package              | `dist/<course>-scorm2004.zip` |
| `cmi5`            | cmi5 package (AU + manifest)                | `dist/<course>-cmi5.zip`      |
| `xapi`            | xAPI 1.0.3 "Tin Can" package (`tincan.xml`) | `dist/<course>-xapi.zip`      |

Upload the LMS zips via your LMS's import flow; drop `dist/` (web) on any static host.

`--standard <web|scorm12|scorm2004|cmi5|xapi>` overrides `export.standard` for one build without editing `course.config.js` — e.g. `pnpm export <course> --standard scorm2004`. Useful for packaging the same course for multiple LMSs from one config. `pnpm validate <course> --standard <value>` takes the same flag to preview validation against the overridden standard. An unknown value fails before the build runs.

### Web export Content-Security-Policy

Web builds emit a baseline CSP `<meta>` (LMS packages and the dev server don't). It allows any `https:` for images/media/frames/network, but **not** for scripts, styles, or fonts — so a CDN script/stylesheet/font is blocked until you allow its origin. Extend per-directive via `export.csp` (sources are **appended** to the baseline, never replaced):

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
- To **tighten** or replace a directive (not just add), use a `transformIndexHtml` hook — `export.csp` only adds.
- Ignored unless `standard` is `'web'`.

### Validation

The plugin validates on every dev start and build (page syntax, manifest shape, `pageConfig`, question components, asset references, data-contract bypass). Errors abort the build and print `[tessera error] ...`; warnings print `[tessera warning] ...` and don't block. Run `pnpm validate <course>` to check without building.

---

## Accessibility

Two passes plus components that are accessible by construction.

**Static checks** run inside `validate` / `dev` / `export` — no setup. They cover: `<Image>` alt-or-`decorative`; `<Video>`/`<Audio>` `title` + captions/transcript; empty question labels; skipped heading levels; `branding.primaryColor` contrast against white; well-formed `language`; and the Svelte compiler's `a11y_*` warnings. Each diagnostic carries a rule ID (`[tessera/image-alt]`, `[a11y_missing_attribute]`) — that ID is what `a11y.ignore` and `a11y.level` match.

**Runtime audit** (`tessera a11y`, or via `pnpm check`) is the opt-in deep pass: builds the course, renders **every** page headless (incl. quiz-gated), runs [axe-core](https://github.com/dequelabs/axe-core), writes `a11y-report.json` (git-ignored), exits non-zero at/above the impact threshold (default `serious`; `--threshold minor` is stricter). It catches what static can't — computed ARIA, focus order, rendered contrast — and uses the web adapter, so it works regardless of `export.standard`. First run auto-installs Chromium.

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
  readonly isLockedCorrect: boolean; // narrow case: retry policy preserved this as already-correct
  readonly render: unknown; // snippet the widget registered; shell calls {@render q.render()}
  setAnswer(answer: unknown): void;
  commit(): void; // report this answer to the LMS now. Idempotent. The shell calls it once the answer is final.
}
```

Gate input on `q.locked`; branch on `q.isLockedCorrect` only to render the "already correct" banner.

A widget that builds its answer incrementally (matching, ordering, multi-select) must pass `complete` to `useQuestion()`. Without it the shell treats the first `setAnswer()` as a finished answer and offers to submit half of one. Read reactive state inside it (`matches.size === pairs.length` over a `SvelteMap`), or the shell's button gating never updates.

`Interaction` uses SCORM 2004 vocabulary: `choice`, `true-false`, `fill-in`, `long-fill-in`, `matching`, `sequencing`, `numeric`, `likert`, `performance`, `other`. Each is `{ type, response, correct? }`. Omit `correct` to skip auto-judging (`useQuestion` reports `null` correctness; your widget renders its own UI).

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
- **Standalone:** the widget owns Check/Retry. Set `graded: true` to count toward course success.

```ts
function useQuestion(opts: {
  id: string; // unique on the page; LMS interaction id
  graded?: boolean; // standalone only
  response: () => Interaction; // current answer; read at submit (and on each commit())
  score?: () => number; // standalone-only override (0–100)
  weight?: number; // page-level rollup weight (default 1)
  maxRetries?: number; // standalone retry cap (default Infinity); ignored inside a quiz
  complete?: () => boolean; // is the answer fully specified? default true
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

See [Recipe 2b](#recipe-2b-custom-question-widget-for-a-custom-quiz-shell) for a full widget and [Recipe 3](#recipe-3-graded-standalone-question) for a graded standalone.

### `useQuiz`

Orchestration hook for any `quiz.svelte` (and the built-in `<Quiz>`). `submit()` reports every question to the LMS, then dispatches `tessera-quiz-complete`. **`submit()` is the only sanctioned dispatcher of `tessera-quiz-complete`** — bypass it and the quiz never marks Completed/Passed/Failed.

**Report when the answer is final, not on click.** Widgets call `setAnswer()` only. The shell decides when an answer is final: the built-in `<Quiz>` commits a question when `feedbackMode: 'immediate'` reveals it (the reveal locks the answer), and `submit()` reports whatever is left. A custom shell with no Submit button calls `q.commit()` itself and still calls `submit()` at the end to fire `tessera-quiz-complete`.

```ts
function useQuiz(opts: { element: () => HTMLElement | null }): {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number; // the attempt just submitted, or the restored result
  readonly bestScore: number; // highest across attempts; this is what the LMS gets
  readonly passingScore: number; // resolved at runtime (config + LMS mastery override)
  readonly attemptCount: number;
  readonly restored: boolean; // results came from saved progress, not this session
  submit(): void;
  retry(): void;
  startReview(): void;
  exitReview(): void;
  revealFeedback(q: Question): void; // immediate-feedback flow
};
```

**Show `bestScore` when it beats `score`.** `score` is the attempt the learner just finished, so a weaker retry shows a failing result on a quiz they already passed. The LMS and the navigation gate are given `bestScore`, so a shell offering retries must surface it whenever `bestScore > score`.

**Branch on `restored`.** A quiz whose result came from saved progress opens in the `submitted` state with the score and attempt count intact, but answers aren't persisted: every `q.correct` is `null`, `q.feedbackVisible` is `false`, and `startReview()` is a no-op. Show the score and a Retry button; don't offer Review or a per-question breakdown.

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

Each `ManifestPage` exposes `slug`, `title`, and `index`.

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

Usage in [Recipe 1](#recipe-1-custom-draw-a-line-question) (persists partial progress).

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

`useXAPI()` is callable anywhere (setup, handlers, async, `.ts` modules). It returns `null` when no LRS is configured or before adapter init resolves — **null-check and degrade gracefully**. The publisher fills in `actor`, `timestamp`, `id`, `context.contextActivities.grouping`, and (cmi5) `context.registration` + `sessionid`; you supply `verb`, optionally `object` (defaults to the activity), `result`, `context`, `attachments`.

### Configure the destination

`config.xapi` is one destination or an array, always explicit (no implicit default):

```js
xapi: {
  endpoint: 'https://lrs.example.com/xapi/',
  auth: () => fetch('/api/lrs-token').then(r => r.text()),
  actor: () => getCurrentUser(),     // or a static Agent object
  activityId: 'https://example.com/courses/intro-to-x',
}

// Inherit the LMS launch LRS (cmi5 / xapi; ignored under other standards):
xapi: { endpoint: 'lms' }

// Fan out (at most one 'lms' entry):
xapi: [
  { endpoint: 'lms' },
  { endpoint: 'https://analytics.example.com/xapi/', auth, actor, activityId },
]
```

Each destination has its own queue, auth resolver, and retry loop. One UUID per `sendStatement` is reused across destinations (idempotent dedupe).

### Per-mode behaviour

| Mode          | `xapi` not set     | `xapi.endpoint: 'lms'`  | `xapi: {endpoint, ...}` (explicit)                      |
| ------------- | ------------------ | ----------------------- | ------------------------------------------------------- |
| **cmi5**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **xapi**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **scorm12**   | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.learner_id`      |
| **web**       | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` **required** in config             |

### Gotchas

- **Actor priority:** author-supplied `xapi.actor` always wins; else cmi5 launch actor; else SCORM-derived from the LMS data model; else error. Override the SCORM-derived `homePage` via `actorAccountHomePage` (required if `activityId` is a non-URL IRI).
- **Auth is Basic-only.** Pass the credential value, not the full header (the publisher prepends `Basic `). For OAuth, return a Basic credential from your `auth` function or run a proxy.
- **`course.config.js` is serialized verbatim into the client bundle** — every field is public, not just `auth`. Never put a static `auth` string, API key, or any secret in it; use a function that fetches a server-brokered short-lived token. CORS must allow the served origin.
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

The runtime translates author intent into adapter calls automatically. The author-relevant differences:

| Concern              | SCORM 1.2                                                                            | SCORM 2004 4th                                                 | cmi5                                 |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------ |
| Completion + success | One field (`lesson_status`); no "unknown" — success wins when known, else completion | Two independent fields (`completion_status`, `success_status`) | Completed + Passed/Failed statements |
| Score scale to LMS   | `score.raw` (0–100)                                                                  | `score.raw` (0–100) **and** `score.scaled` (0–1)               | `result.score.scaled` (0–1)          |
| `usePersistence` cap | ~4 KB (plan for 4096 chars)                                                          | 64000 chars                                                    | LRS-defined (typically unbounded)    |
| Resume after reload  | From `cmi.suspend_data`                                                              | From `cmi.suspend_data`                                        | From `tessera-state` (State API)     |

Author-facing consequences:

- **Keep persisted state small under SCORM 1.2** — it shares the ~4 KB `suspend_data` budget with progress and bookmarks.
- **SCORM 1.2 shows `incomplete` until a graded quiz produces a result** (no "unknown"); pass/fail uses `scoring.passingScore`, not the LMS's mastery field.
- **SCORM 2004 / cmi5 honor an LMS-supplied mastery score** at launch, overriding `scoring.passingScore` — read it via `useQuiz().passingScore`.
- A failed `adapter.init()` renders a visible "This course can't run here" panel — never a silent degradation.

### Local testing

| Standard  | How to test                                                                                   |
| --------- | --------------------------------------------------------------------------------------------- |
| scorm12   | Upload `dist/*-scorm12.zip` to [SCORM Cloud](https://cloud.scorm.com) (free) or Reload Player |
| scorm2004 | SCORM Cloud (easiest); also Moodle, Cornerstone, SuccessFactors, Canvas                       |
| cmi5      | Upload `dist/*-cmi5.zip` to SCORM Cloud and use its generated cmi5 dispatch URL               |
| xapi      | Upload `dist/*-xapi.zip` to SCORM Cloud (imports `tincan.xml`) and launch the generated URL   |
| web       | Serve `dist/` from any static host                                                            |

Inspect the LMS API call log to confirm `lesson_status` / `completion_status` / interactions look right.

---

## Custom Layouts

Drop `layout.svelte` at the project root to replace the default chrome. The contract: it receives a single `page` snippet prop and renders it where the active page goes; use hooks for everything else.

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

<!-- line-drawing UI calls connect(l, r) on drop -->

{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
  {#if q.correct === true}<p>Correct.</p>{/if}
  {#if q.correct === false}<button onclick={() => q.reset()}>Try again</button
    >{/if}
{/if}
```

### Recipe 2: Custom quiz shell via `quiz.svelte`

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
    {#if quiz.bestScore > quiz.score}<p>Best attempt: {quiz.bestScore}%</p>{/if}
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    {#if !quiz.restored}<button onclick={() => quiz.startReview()}
        >Review</button
      >{/if}
  {/if}

  <!-- Children render hidden so widget state survives submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

Always submit through `useQuiz().submit()`.

`children` is the whole page body as one snippet, and built-in widgets render nothing inside it. Two layouts:

| Layout          | `children`       | `q.render()`          | Page prose         |
| --------------- | ---------------- | --------------------- | ------------------ |
| Snippet (above) | rendered hidden  | rendered per question | unavailable        |
| Inline          | rendered visibly | never called          | interleaved freely |

Inline layout needs custom widgets that render their own markup instead of calling `setRender`. Built-in widgets render nothing in that layout.

### Recipe 2b: Custom question widget for a custom quiz shell

The widget calls `useQuestion()`, registers a render snippet with `setRender`, pushes answers up with `setAnswer`, and reads `locked`/`feedbackVisible`/`answer`. Reporting is `useQuiz().submit()`'s job.

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

{#if q.mode === 'standalone'}
  {@render view()}
  {#if !q.submitted}
    <button disabled={selected === null} onclick={() => q.submit()}
      >Check</button
    >
  {/if}
{/if}
```

Feedback timing: `feedbackMode: 'immediate'` → shell calls `quiz.revealFeedback(q)`, flipping `feedbackVisible` (and `locked`). `'review'` → after `submit()` + `startReview()`. `'never'` → `feedbackVisible` stays false but `locked` still flips on submit.

### Recipe 2c: Inline layout (prose between questions)

Render `children` visibly, never call `q.render()`, and let widgets render their own markup. Questions then sit in page order, interleaved with the page's prose.

```svelte
<!-- quiz.svelte -->
<div bind:this={host}>
  {@render children?.()}
  <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
    >Submit</button
  >
</div>
```

```svelte
<!-- components/InlineChoice.svelte — no setRender, no mode branch -->
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

A standalone question (no `<Quiz>`) counts toward course success when built with `graded: true` + a `score()` returning 0–100; omit `correct` to accept any answer. Course success rolls up across all graded items, quizzes and standalones alike.

```js
const q = useQuestion({
  id: 'why-it-matters',
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

---

## Constraints

- **No runtime data fetching in pages.** Page content is static; no `fetch()` or dynamic loaders in page components.
- **Public API only.** Import from `tessera-learn`. Never from `tessera-learn/runtime/*` — those paths are internal and may change.
- **`pageConfig` must be a static object literal.** Trailing commas, unquoted keys, single quotes are fine (JSON5); variables, function calls, template literals, and computed values are not.
- **Third-party libraries** must be project dependencies in `package.json`.
