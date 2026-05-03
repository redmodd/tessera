// Auto-generated AGENTS.md content for scaffolded projects.
// This is the full authoring guide that enables LLMs and authors to produce valid Tessera courses.
// To regenerate: copy contents of AGENTS.md and re-run the sync (escape backticks and ${).

export const AGENTS_MD = `# AGENTS.md — Tessera Course Authoring Guide

Tessera is an **LMS tracking runtime** for interactive learning content. It handles SCORM 1.2 / SCORM 2004 / cmi5 / xAPI statements, progress state, completion and success rollup, persistence, and navigation gating — and gets out of the way for the presentation layer.

Build a course entirely with the built-in components, entirely with your own components via four hooks, or any mix. The built-ins are reference implementations. Replace any of them.

**Lock the data contract. Free the presentation.**

This file is the canonical reference for any agent (Claude Code, Cursor, Aider, codex, etc.) or human author working in a Tessera project. Read this before generating or editing course code.

---

## Project Structure

\`\`\`
my-course/
├── course.config.js          # Course configuration
├── vite.config.js             # Vite config (do not modify)
├── package.json
├── pages/                     # Course content
│   ├── 01-section-name/
│   │   ├── _meta.js
│   │   ├── 01-lesson-name/
│   │   │   ├── _meta.js
│   │   │   ├── page-one.svelte
│   │   │   └── page-two.svelte
│   │   └── 02-another-lesson/
│   │       ├── _meta.js
│   │       └── overview.svelte
│   └── 02-another-section/
│       └── ...
├── assets/                    # Images, audio, video files
├── styles/                    # Custom CSS overrides
└── AGENTS.md                  # This file
\`\`\`

### Hierarchy

1. **Sections** — top-level folders in \`pages/\` (e.g., \`01-introduction/\`)
2. **Lessons** — folders inside a section (e.g., \`01-welcome/\`)
3. **Pages** — \`.svelte\` files inside a lesson (e.g., \`welcome.svelte\`)

### Naming

- Sections and lessons use numeric prefixes for ordering: \`01-getting-started/\`.
- Page files do **not** use numeric prefixes: \`welcome.svelte\`.
- Display names strip the prefix: \`01-getting-started\` → "Getting Started".
- Slugs strip the prefix: \`02-core-concepts/\` → \`core-concepts\`.

### \`_meta.js\` files

Every section and lesson folder must have a \`_meta.js\`.

\`\`\`js
// section _meta.js
export default { title: "Getting Started" };
\`\`\`

\`\`\`js
// lesson _meta.js — \`pages\` is optional and controls order
export default {
  title: "Welcome",
  pages: ["welcome", "objectives"],
};
\`\`\`

Pages listed in \`pages\` come first in listed order; any unlisted \`.svelte\` files are appended alphabetically. Omit \`pages\` to order all files alphabetically.

---

## Authoring Surfaces

There are exactly three:

1. **Built-in components** — \`Callout\`, \`Image\`, \`Quiz\`, \`MultipleChoice\`, etc., from \`@redmondd/tessera\`. Use, compose, or skip.
2. **Hooks** — \`useQuestion\`, \`useNavigation\`, \`useProgress\`, \`usePersistence\`. The stable contract between custom widgets and the runtime. Anything the built-ins do, you can do.
3. **Custom layout** — drop \`layout.svelte\` at the project root to replace the default chrome.

The built-ins are reference implementations of the hooks. Want a draggable timeline question? Write a Svelte component, call \`useQuestion\`, emit an \`Interaction\`. The runtime treats it identically to \`<MultipleChoice>\` — same scoring, same LMS reporting, same persistence.

---

## Creating Pages

Each page is a \`.svelte\` file inside a lesson folder.

### Basic page

\`\`\`svelte
<h1>Welcome</h1>
<p>Standard HTML works as-is.</p>
\`\`\`

### Page configuration

\`pageConfig\` sets the page title and configures quizzes. It must be a **static object literal** in a module script block — no variables, function calls, or computed values.

Both \`<script module>\` (Svelte 5) and \`<script context="module">\` (legacy) are accepted by the manifest parser.

\`\`\`svelte
<script module>
  export const pageConfig = {
    title: "Introduction to the Topic",
  };
</script>

<h1>Introduction to the Topic</h1>
\`\`\`

If \`pageConfig.title\` is omitted, the title is derived from the filename: \`my-page.svelte\` → "My Page".

### Importing components

\`\`\`svelte
<script>
  import { Callout, Image } from '@redmondd/tessera';
</script>

<Callout type="info">
  <p>Helpful information.</p>
</Callout>
\`\`\`

---

## Component Reference

All components import from \`@redmondd/tessera\`. Nothing is loaded automatically; import only what you use.

### Callout

Styled box for highlighting information.

| Prop | Type | Default |
|------|------|---------|
| \`type\` | \`"info" \| "warning" \| "tip" \| "important"\` | \`"info"\` |

Children become the body. A11y: \`role="note"\` with type-appropriate \`aria-label\`.

\`\`\`svelte
<Callout type="warning"><p>Be careful.</p></Callout>
\`\`\`

### Image

Lazy-loaded image with optional caption. Renders as \`<figure>\`/\`<figcaption>\`.

| Prop | Type | Description |
|------|------|-------------|
| \`src\` | \`string\` | Image URL. \`$assets/\` prefix supported |
| \`alt\` | \`string\` | **Required.** Alt text |
| \`caption\` | \`string\` | Optional caption |

\`\`\`svelte
<Image src="$assets/diagram.png" alt="System architecture diagram" caption="Figure 1" />
\`\`\`

### Accordion / AccordionItem

Expandable panels. Only one open at a time. A11y: \`aria-expanded\`, \`aria-controls\`, \`role="region"\`, keyboard Enter/Space.

\`\`\`svelte
<Accordion>
  <AccordionItem title="What is Tessera?">
    <p>An LMS tracking runtime for interactive learning content.</p>
  </AccordionItem>
  <AccordionItem title="How do I start?">
    <p>Add pages in <code>pages/</code> and import components.</p>
  </AccordionItem>
</Accordion>
\`\`\`

### Carousel / CarouselSlide

Slide-based viewer. A11y: \`role="region"\`, \`aria-roledescription="carousel"\`, arrow keys, mobile swipe.

\`\`\`svelte
<Carousel>
  <CarouselSlide><h3>Step 1</h3><p>Plan.</p></CarouselSlide>
  <CarouselSlide><h3>Step 2</h3><p>Build.</p></CarouselSlide>
  <CarouselSlide><h3>Step 3</h3><p>Deploy.</p></CarouselSlide>
</Carousel>
\`\`\`

### RevealModal

Modal triggered by user interaction. Uses Svelte 5 snippets for \`trigger\` and \`content\`. A11y: \`role="dialog"\`, \`aria-modal="true"\`, focus trap, Escape to close.

| Prop | Type | Description |
|------|------|-------------|
| \`title\` | \`string\` | Modal label for screen readers |
| \`trigger\` | \`snippet\` | Click target that opens the modal |
| \`content\` | \`snippet\` | Modal body |

\`\`\`svelte
<RevealModal title="Details">
  {#snippet trigger()}<button>More info</button>{/snippet}
  {#snippet content()}
    <h3>Additional Information</h3>
    <p>Press Escape or click outside to close.</p>
  {/snippet}
</RevealModal>
\`\`\`

### Video

YouTube/Vimeo iframe (auto-detected, responsive 16:9) or native \`<video>\` for direct files. Lazy-loads on scroll.

| Prop | Type | Description |
|------|------|-------------|
| \`src\` | \`string\` | Video URL or \`$assets/\` path |
| \`title\` | \`string\` | Accessible label |

\`\`\`svelte
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Intro" />
<Video src="$assets/demo.mp4" title="Demo" />
\`\`\`

### Audio

Native player. A11y: \`aria-label\` from title.

\`\`\`svelte
<Audio src="$assets/lecture-01.mp3" title="Lecture 1" />
\`\`\`

---

## Quizzes

A quiz page is a normal page with \`pageConfig.quiz\` set and a \`<Quiz>\` wrapper around question components.

### Setup

\`\`\`svelte
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
  import { Quiz, MultipleChoice } from '@redmondd/tessera';
</script>

<h1>Module 1 Quiz</h1>
<Quiz>
  <MultipleChoice
    question="Which planet is closest to the Sun?"
    options={["Venus", "Mercury", "Earth", "Mars"]}
    correct={1}
  />
</Quiz>
\`\`\`

### \`pageConfig.quiz\` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| \`graded\` | \`boolean\` | \`false\` | Whether the score counts toward course success |
| \`gatesProgress\` | \`boolean\` | \`false\` | Whether passing is required to access the next page |
| \`maxAttempts\` | \`number\` | \`Infinity\` | Max attempts |
| \`showFeedback\` | \`boolean\` | \`true\` | Show feedback after submission |
| \`feedbackMode\` | \`"review" \| "immediate"\` | \`"review"\` | \`review\` = after full submit; \`immediate\` = after each question |
| \`retryMode\` | \`"full" \| "incorrect-only"\` | \`"full"\` | \`incorrect-only\` locks correct answers on retry |

\`gatesProgress: true\` blocks navigation to the next page until the learner passes. Works in both \`free\` and \`sequential\` navigation modes.

### Question types

#### MultipleChoice

| Prop | Type | Description |
|------|------|-------------|
| \`question\` | \`string\` | Prompt |
| \`options\` | \`string[]\` | Answer options |
| \`correct\` | \`number\` | Index of correct option (0-based) |
| \`correctFeedback\` | \`string\` | Optional |
| \`incorrectFeedback\` | \`string\` | Optional |
| \`optionFeedback\` | \`string[]\` | Optional per-option feedback |

\`\`\`svelte
<MultipleChoice
  question="What is the capital of France?"
  options={["London", "Berlin", "Paris", "Madrid"]}
  correct={2}
/>
\`\`\`

#### FillInTheBlank

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`question\` | \`string\` | — | Prompt |
| \`answers\` | \`string[]\` | — | Acceptable answers |
| \`caseSensitive\` | \`boolean\` | \`false\` | Comparison casing |

\`answers\` only needs distinct spellings; \`caseSensitive: false\` already handles case variants.

\`\`\`svelte
<FillInTheBlank
  question="What element has the symbol 'O'?"
  answers={["Oxygen"]}
/>
\`\`\`

#### Matching

| Prop | Type | Description |
|------|------|-------------|
| \`question\` | \`string\` | Prompt |
| \`pairs\` | \`{left: string, right: string}[]\` | Correct pairs |

The right column is auto-shuffled. Click left then right to match (tap on mobile). Click a matched pair to unmatch. All pairs must be correct.

\`\`\`svelte
<Matching
  question="Match country to capital:"
  pairs={[
    { left: "France", right: "Paris" },
    { left: "Germany", right: "Berlin" },
    { left: "Japan", right: "Tokyo" },
  ]}
/>
\`\`\`

#### Sorting

Drag-and-drop (or click-to-place) into labelled categories.

| Prop | Type | Description |
|------|------|-------------|
| \`question\` | \`string\` | Prompt |
| \`items\` | \`string[]\` | Items to sort |
| \`targets\` | \`string[]\` | Category labels |
| \`correct\` | \`number[]\` | For each item, the index of its correct target (parallel array) |

\`\`\`svelte
<Sorting
  question="Sort each animal:"
  items={["Dog", "Eagle", "Salmon", "Cat", "Robin", "Trout"]}
  targets={["Mammals", "Birds", "Fish"]}
  correct={[0, 1, 2, 0, 1, 2]}
/>
\`\`\`

### Standalone questions

All four question components also work outside \`<Quiz>\` for inline practice. Standalone widgets render their own Check / Retry buttons.

| Prop | Type | Default |
|------|------|---------|
| \`maxRetries\` | \`number\` | \`Infinity\` |

\`\`\`svelte
<MultipleChoice
  question="What color is the sky on a clear day?"
  options={["Red", "Blue", "Green"]}
  correct={1}
  maxRetries={2}
/>
\`\`\`

Standalone questions are not graded by default. To grade one (e.g., a required reflection that affects course success), build it with the \`useQuestion\` hook directly — see [Recipe 4](#recipe-4-graded-standalone-question).

---

## Assets

Drop files into \`assets/\`. Reference them with \`$assets/\` in component props:

\`\`\`svelte
<Image src="$assets/photo.png" alt="Photo" />
<Video src="$assets/demo.mp4" title="Demo" />
<Audio src="$assets/lecture.mp3" title="Lecture" />
\`\`\`

In CSS, use a relative path from \`styles/\`:

\`\`\`css
.bg { background-image: url('../assets/bg.png'); }
\`\`\`

External URLs work too: \`<Image src="https://example.com/img.jpg" alt="..." />\`.

---

## Styling

Add \`.css\` files to \`styles/\`. They load after framework styles and override them.

### CSS custom properties

Override these to theme globally:

| Property | Default |
|----------|---------|
| \`--tessera-primary\` | \`#2563eb\` |
| \`--tessera-primary-light\` | \`#dbeafe\` |
| \`--tessera-primary-dark\` | \`#1e40af\` |
| \`--tessera-text\` | \`#1f2937\` |
| \`--tessera-text-light\` | \`#6b7280\` |
| \`--tessera-bg\` | \`#ffffff\` |
| \`--tessera-bg-secondary\` | \`#f9fafb\` |
| \`--tessera-border\` | \`#e5e7eb\` |
| \`--tessera-success\` | \`#16a34a\` |
| \`--tessera-error\` | \`#dc2626\` |
| \`--tessera-warning\` | \`#d97706\` |
| \`--tessera-font-family\` | \`'Inter', system-ui, sans-serif\` |
| \`--tessera-font-size-base\` | \`1rem\` |
| \`--tessera-line-height\` | \`1.6\` |
| \`--tessera-spacing-sm\` / \`-md\` / \`-lg\` / \`-xl\` | \`0.5rem\` / \`1rem\` / \`1.5rem\` / \`2rem\` |
| \`--tessera-sidebar-width\` | \`280px\` |
| \`--tessera-content-max-width\` | \`800px\` |

\`\`\`css
:root {
  --tessera-primary: #9333ea;
  --tessera-font-family: 'Georgia', serif;
}
\`\`\`

\`branding.primaryColor\` and \`branding.fontFamily\` in \`course.config.js\` cover the common overrides without writing CSS.

---

## \`course.config.js\`

\`\`\`js
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
\`\`\`

- \`navigation.mode: "free"\` → all pages accessible except those blocked by gating quizzes.
- \`navigation.mode: "sequential"\` → pages unlock one at a time as each is completed.
- \`completion.mode: "percentage"\` → course completes when \`visitedPages / totalPages * 100 >= percentageThreshold\`.
- \`completion.mode: "quiz"\` → course completes when graded quiz average >= \`scoring.passingScore\`.

### Custom access rules

For anything beyond the two presets (prereqs, instructor approval, time gating), supply \`navigation.canAccess\`. It runs synchronously on every navigation evaluation — keep it cheap.

\`\`\`js
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
\`\`\`

\`AccessContext\` exposes \`pageIndex\`, \`page\`, \`manifest\`, \`progress\`, and \`config\`. The presets \`freeAccess\` and \`sequentialAccess\` are re-exported from \`@redmondd/tessera\` for composition.

### LMS export and fail-loud behaviour

When \`export.standard\` is \`"scorm12"\`, \`"scorm2004"\`, or \`"cmi5"\`, the runtime selects the matching adapter at startup. **In production builds**, if the matching LMS API isn't reachable (no \`API\` / \`API_1484_11\` in the frame chain, no cmi5 launch parameters), the runtime throws \`LMSAdapterError\` and renders a visible "This course can't run here" panel — it does **not** silently fall back to localStorage. Use \`export.standard: "web"\` for any non-LMS testing or distribution.

In dev mode (\`vite dev\` / \`npm run preview\`), missing APIs warn to the console and fall back to \`localStorage\` so authors can iterate locally.

---

## Hooks Reference

The four hooks are the stable contract between widgets and the runtime.

\`\`\`js
import {
  useQuestion,
  useNavigation,
  useProgress,
  usePersistence,
  isCorrect,
} from '@redmondd/tessera';
import type { Interaction } from '@redmondd/tessera';
\`\`\`

Each hook is synchronous and must be called during component setup, inside a Tessera course. Calling them outside the runtime throws.

### \`useQuestion\`

Register a question widget so the runtime can submit, score, persist, and report it.

- **Inside \`<Quiz>\`** — the parent Quiz drives submission. The widget renders the prompt + answer UI; nothing else.
- **Standalone** — the widget owns its own Check/Retry. Set \`graded: true\` to count toward course success.

\`\`\`ts
function useQuestion(opts: {
  id: string;                   // unique on the page; LMS interaction id
  graded?: boolean;             // standalone only
  response: () => Interaction;  // current learner answer; called on submit
  score?: () => number;         // standalone-only override (0–100)
  reset?: () => void;
}): {
  submit(): void;
  reset(): void;
  readonly submitted: boolean;
  readonly correct: boolean | null;
  readonly mode: 'standalone' | 'quiz';
  readonly quizIndex: number | undefined;
};
\`\`\`

\`Interaction\` follows SCORM 2004 4th Edition vocabulary verbatim: \`choice\`, \`true-false\`, \`fill-in\`, \`long-fill-in\`, \`matching\`, \`sequencing\`, \`numeric\`, \`likert\`, \`performance\`, \`other\`. Each is \`{ type, response, correct? }\`. Omit \`correct\` if the runtime should not auto-judge — \`useQuestion\` reports a \`null\` correctness flag and your widget renders its own UI.

\`\`\`svelte
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

<!-- drag-to-reorder UI bound to \`order\` -->
{#if q.mode === 'standalone'}
  <button onclick={() => q.submit()} disabled={q.submitted}>Check</button>
{/if}
\`\`\`

### \`useNavigation\`

\`\`\`ts
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
\`\`\`

### \`useProgress\`

\`\`\`ts
function useProgress(): {
  readonly visitedPages: Set<number>;
  readonly quizScores: Map<number, number>;            // pageIndex → score 0–100
  readonly chunkProgress: Map<number, number>;         // pageIndex → highest revealed chunk index
  readonly completionStatus: 'incomplete' | 'complete';
  readonly successStatus: 'unknown' | 'passed' | 'failed';
  markVisited(pageIndex: number): void;
  markChunk(pageIndex: number, chunkIndex: number): void;
};
\`\`\`

### \`usePersistence<T>(key)\`

Per-widget persistent state. Survives reload on every adapter — \`localStorage\` for web, SCORM \`cmi.suspend_data\` for SCORM 1.2/2004, xAPI State API for cmi5. Reads sync; writes batched by the adapter. JSON-serializable values only.

\`\`\`ts
function usePersistence<T>(key: string): {
  get(): T | null;
  set(value: T): void;
};
\`\`\`

\`\`\`svelte
<script>
  import { usePersistence } from '@redmondd/tessera';

  const store = usePersistence('whiteboard');
  let state = $state(store.get() ?? { strokes: [] });
  $effect(() => store.set(state));
</script>
\`\`\`

### \`isCorrect(interaction)\`

Pure helper. Returns \`true\`, \`false\`, or \`null\` (when the interaction has no \`correct\` field).

\`\`\`ts
function isCorrect(i: Interaction): boolean | null;
\`\`\`

---

## Custom Layouts

Drop \`layout.svelte\` at the project root to replace the default sidebar/topbar/prev-next chrome. The runtime uses it whenever it exists.

The contract: the file receives a single \`page\` snippet prop and renders it where the active page should appear. Use the hooks for everything else.

\`\`\`svelte
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
\`\`\`

To keep most of the default chrome and swap one piece, import \`DefaultLayout\` from \`@redmondd/tessera\` and compose around it.

---

## Cookbook

End-to-end recipes that exercise the full hooks API. Adapt to taste.

### Recipe 1: Custom "draw a line" question

Learner connects a left-side label to a right-side label by drawing a line. Emits a \`matching\` interaction so the runtime scores it identically to \`<Matching>\`. Persists partial progress so an interrupted session resumes cleanly.

\`\`\`svelte
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
\`\`\`

### Recipe 2: Custom topbar layout

Replace the default sidebar with a horizontal topbar showing breadcrumb + progress %. Drop \`layout.svelte\` at the project root; no other changes needed.

\`\`\`svelte
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
\`\`\`

### Recipe 3: Prerequisite-based access

Lock lesson 5 until lessons 1–3 are visited. Composes with \`sequentialAccess\` instead of re-implementing it.

\`\`\`js
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
\`\`\`

### Recipe 4: Graded standalone question

A single inline reflection — not in a \`<Quiz>\` but \`graded: true\`, so it counts toward course success. Useful for "must answer to pass" gates without the quiz wrapper.

\`\`\`svelte
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
      // No \`correct\` — any answer accepted; we just want completion.
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
\`\`\`

The LMS sees a graded \`long-fill-in\` interaction. Course success rolls up across all graded items — quizzes and standalones alike.

---

## Constraints

- **No runtime data fetching.** Page content is static — no \`fetch()\` or dynamic loaders in page components.
- **Use the hooks.** Import \`useQuestion\` / \`useNavigation\` / \`useProgress\` / \`usePersistence\` from \`@redmondd/tessera\`. Do **not** import from \`@redmondd/tessera/runtime/*\` — those paths are internal and may change.
- **Static \`pageConfig\` only.** Plain object literal with static values. No variables, function calls, template literals, or computed values. JSON5-compatible syntax (trailing commas, unquoted keys, single quotes are fine).
- **Module-script form.** \`<script module>\` (Svelte 5) or \`<script context="module">\` (legacy) both work; the manifest parser accepts either.
- **Third-party libraries** must be added as project dependencies in \`package.json\`.
- **\`$assets/\` alias** works in JavaScript / Svelte component props only. In CSS, use relative paths from \`styles/\`.
`;
