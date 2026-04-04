# Tessera — Implementation Specification

This document is a build spec derived from `tessera-design.md`. It contains only actionable implementation details organized into sequential, testable steps. For design rationale and user-facing behavior, refer to the design doc.

**Convention:** This document is the canonical source for what gets built. If a component, prop, or behavior is not specified here, it is not in v1.

**Testing:** Use Vitest for unit tests and Playwright for end-to-end browser tests. Each step has acceptance criteria that must pass before moving to the next step.

---

## Step 0: Monorepo Setup ✅

**Goal:** A working monorepo with both packages, TypeScript, and dev tooling.

### What to Build

```
tessera/
├── pnpm-workspace.yaml           # packages: ['packages/*']
├── package.json                   # root scripts: test, lint, build
├── tsconfig.json                  # root TypeScript config (ES2022, strict)
├── packages/
│   ├── create-tessera/
│   │   ├── package.json           # bin: { "create-tessera": "./dist/index.js" }
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts           # placeholder: console.log('create-tessera')
│   └── tessera/
│       ├── package.json           # exports: components, plugin, runtime
│       ├── tsconfig.json
│       ├── src/
│       │   ├── components/        # empty
│       │   ├── runtime/           # empty
│       │   └── plugin/            # empty
│       └── styles/                # empty
```

**`tessera/package.json` exports:**
```json
{
  "name": "tessera",
  "type": "module",
  "exports": {
    ".": "./src/components/index.ts",
    "./plugin": "./src/plugin/index.ts",
    "./runtime/*": "./src/runtime/*"
  },
  "svelte": "./src/components/index.ts"
}
```

**`tessera/package.json` dependencies** (in addition to exports above):
```json
{
  "dependencies": {
    "svelte": "^5.0.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "json5": "^2.0.0"
  }
}
```

`svelte` and `@sveltejs/vite-plugin-svelte` are dependencies of `tessera` — not the user's project. `tesseraPlugin()` manages Svelte compilation internally. `json5` is used for `pageConfig` extraction (Step 2a).

**Build tooling:**
- TypeScript source, ESM only output
- `svelte` field in `tessera/package.json` for component source
- Components distributed as `.svelte` source (consumer's Vite/Svelte compiler processes them)
- Plugin and runtime code built with `tsup` for distribution

### Acceptance Criteria

- `pnpm install` succeeds from repo root
- `pnpm -r build` runs without errors (even if builds are empty/placeholder)
- TypeScript compiles with no errors

---

## Step 1: Vite Plugin Core ✅

**Goal:** A minimal Vite plugin that serves a hello-world Svelte app via virtual entry points.

**Package:** `tessera` (`src/plugin/`)

### What to Build

#### 1a. Plugin Entry Point

```ts
// src/plugin/index.ts
import { svelte } from '@sveltejs/vite-plugin-svelte';

export function tesseraPlugin() {
  return [
    svelte({
      compilerOptions: { css: 'injected' },
      // Ensure tessera components are compiled, not treated as external
      include: [/\.svelte$/, /tessera\/src\/.*\.svelte$/],
    }),
    tesseraEntryPlugin(),
    tesseraConfigPlugin(),
  ];
}
```

`tesseraPlugin()` is the **only** plugin users need in their `vite.config.js`. It internally includes the Svelte Vite plugin.

#### 1b. Virtual Entry Points (`tessera:entry`)

Provide virtual `index.html` and `main.ts`:

**Virtual `index.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tessera Course</title>
</head>
<body>
  <div id="tessera-root"></div>
  <script type="module" src="virtual:tessera-main"></script>
</body>
</html>
```

**Virtual `main.ts`:**
```ts
import { mount } from 'svelte';
import App from 'tessera/runtime/App.svelte';

mount(App, {
  target: document.getElementById('tessera-root')!,
});
```

#### 1c. Placeholder App Shell

Create a minimal `src/runtime/App.svelte` that renders "Tessera is running" — just enough to prove the virtual entry works.

#### 1d. Config Plugin (`tessera:config`)

- Register `$assets` alias: `$assets` → `<project-root>/assets/`
- Provide `virtual:tessera-config` — for now, reads `course.config.js` from project root and re-exports its default. If file doesn't exist, export empty object.

**Note on `$assets` in CSS:** The `$assets` alias works in JS/Svelte imports only. CSS `url()` references should use relative paths from the `styles/` directory (e.g., `url('../assets/bg.png')`) — Vite resolves these natively. Document this in TESSERA.md (Step 14).

#### 1e. Test Project

Create a `test-project/` directory at the repo root (gitignored) with:
- `vite.config.js` that imports `tesseraPlugin` from the local workspace package
- `course.config.js` with minimal config
- `assets/` directory
- `pages/` directory (empty for now)

### Acceptance Criteria

- `cd test-project && pnpm dev` starts Vite dev server
- Browser shows "Tessera is running"
- `$assets` alias resolves (add a test image, reference it)
- `virtual:tessera-config` exports the config object

---

## Step 2: Manifest Generation ✅

**Goal:** The Vite plugin scans `pages/` and produces a course manifest as a virtual module.

### What to Build

#### 2a. Manifest Plugin (`tessera:manifest`)

Add `tesseraManifestPlugin()` to the plugin array. On `buildStart` and on file change:

1. Scan `pages/` directory recursively
2. Sort section and lesson folders alphabetically (numeric prefixes control order)
3. For each section folder: read `_meta.js`, extract title (fallback: strip prefix, title-case folder name)
4. For each lesson folder: read `_meta.js`, extract title (same fallback) and `pages` array
5. Order `.svelte` files within each lesson: files listed in `pages` array come first (in listed order), then unlisted `.svelte` files appended alphabetically
6. For each `.svelte` file: extract `pageConfig` via static analysis of `export const pageConfig = { ... }` in `<script context="module">`. Extract `title` and `quiz` config. Fallback title: title-case filename.
7. Assign sequential integer indices to pages (0-based) in resolved order
8. Serve as `virtual:tessera-manifest`

**Manifest shape:**
```json
{
  "sections": [
    {
      "title": "Introduction",
      "slug": "introduction",
      "lessons": [
        {
          "title": "Welcome",
          "slug": "welcome",
          "pages": [
            {
              "index": 0,
              "title": "Welcome to the Course",
              "slug": "welcome",
              "importPath": "./pages/01-introduction/01-welcome/welcome.svelte",
              "quiz": null
            }
          ]
        }
      ]
    }
  ],
  "pages": [
    { "index": 0, "title": "Welcome to the Course", "slug": "welcome", "importPath": "./pages/01-introduction/01-welcome/welcome.svelte", "quiz": null }
  ],
  "totalPages": 1
}
```

The manifest contains both the nested `sections` hierarchy (for sidebar rendering) and a flat `pages` array (for index-based lookup by navigation, progress, and persistence). The flat array is derived from the nested structure at build time — same data, two access patterns.

**`slug` derivation:** strip `.svelte` extension for pages. Strip numeric prefix + hyphen for sections/lessons: `02-getting-started/` → `getting-started`.

**`pageConfig` extraction — specific approach:**

1. Extract the `<script context="module">` block content using a regex (safe — the script block delimiters are well-defined).
2. Find the `export const pageConfig =` declaration using a regex.
3. Extract the object literal that follows by tracking brace depth from the opening `{` to the matching closing `}`.
4. Parse the extracted object literal using `JSON5.parse()` (from the `json5` npm package). JSON5 handles trailing commas, unquoted keys, single-quoted strings, and `Infinity` — all patterns authors will use.
5. If `JSON5.parse()` fails, emit a validation error: "pageConfig must be a static object literal."

Do NOT use `eval()`, `new Function()`, or compile/execute the Svelte file. The `json5` package is added as a dependency of `tessera` in Step 0.

#### 2b. HMR Support

During `vite dev`:
- Watch `pages/` for file additions, deletions, renames, and `_meta.js` changes
- Rebuild manifest on change
- Invalidate `virtual:tessera-manifest` module to trigger HMR

#### 2c. Test Pages

Add to `test-project/`:
```
pages/
  01-introduction/
    _meta.js                    → { title: "Introduction" }
    01-welcome/
      _meta.js                  → { title: "Welcome", pages: ["welcome", "objectives"] }
      welcome.svelte            → <script context="module">export const pageConfig = { title: "Welcome" }</script><h1>Welcome</h1>
      objectives.svelte         → <h1>Objectives</h1>
  02-core-content/
    _meta.js                    → { title: "Core Content" }
    01-basics/
      _meta.js                  → { title: "The Basics", pages: ["overview"] }
      overview.svelte           → <h1>Overview</h1>
```

### Acceptance Criteria

- `virtual:tessera-manifest` returns correct JSON matching the folder structure
- Page order matches the `pages` array in `_meta.js`
- Unlisted `.svelte` files are appended alphabetically
- `pageConfig.title` is extracted correctly; fallback title-casing works for pages without `pageConfig`
- Adding/removing a `.svelte` file during dev triggers manifest rebuild (verify via console log or HMR)
- Unit tests: manifest generation function produces correct output for various folder structures

---

## Step 3: Theme & Base Styles ✅

**Goal:** CSS custom properties and base styles that all components will use.

**Package:** `tessera` (`styles/`)

### What to Build

#### 3a. CSS Custom Properties

Create `styles/theme.css`:

```css
:root {
  /* Colors */
  --tessera-primary: #2563eb;
  --tessera-primary-light: #dbeafe;
  --tessera-primary-dark: #1e40af;
  --tessera-text: #1f2937;
  --tessera-text-light: #6b7280;
  --tessera-bg: #ffffff;
  --tessera-bg-secondary: #f9fafb;
  --tessera-border: #e5e7eb;
  --tessera-success: #16a34a;
  --tessera-error: #dc2626;
  --tessera-warning: #d97706;

  /* Typography */
  --tessera-font-family: 'Inter', system-ui, sans-serif;
  --tessera-font-size-base: 1rem;
  --tessera-line-height: 1.6;

  /* Spacing */
  --tessera-spacing-sm: 0.5rem;
  --tessera-spacing-md: 1rem;
  --tessera-spacing-lg: 1.5rem;
  --tessera-spacing-xl: 2rem;

  /* Layout */
  --tessera-sidebar-width: 280px;
  --tessera-content-max-width: 800px;
}
```

#### 3b. Base Styles

Create `styles/base.css`:
- CSS reset / normalize
- Base typography (body, h1–h6, p, a, lists, code, blockquote)
- All using `--tessera-*` custom properties

#### 3c. Layout Styles

Create `styles/layout.css`:
- App shell grid (sidebar + content area)
- Content area max-width and padding
- Progress bar styles
- Prev/next button container
- Responsive breakpoints:
  - Tablet (max-width: 1024px): sidebar collapses
  - Mobile (max-width: 640px): hamburger nav, full-width content

#### 3d. CSS Auto-Import

Update `tessera:config` plugin to auto-import:
1. Framework styles from `tessera/styles/` (theme.css, base.css, layout.css)
2. User CSS from project's `styles/` directory

Import order: framework → user (user wins via cascade).

#### 3e. Branding Application

Add to the App shell init: read `config.branding` and override CSS custom properties:

```ts
function applyBranding(config) {
  if (config.branding?.primaryColor) {
    document.documentElement.style.setProperty('--tessera-primary', config.branding.primaryColor);
    // compute primary-light and primary-dark from primary
  }
  if (config.branding?.fontFamily) {
    document.documentElement.style.setProperty('--tessera-font-family', config.branding.fontFamily);
  }
}
```

### Acceptance Criteria

- Test project pages render with styled typography (headings, body text, links)
- Changing `branding.primaryColor` in config changes the primary color throughout
- Changing `branding.fontFamily` changes the font
- Adding a CSS file to `test-project/styles/` overrides framework styles
- Layout grid renders correctly at desktop, tablet, and mobile widths

---

## Step 4: App Shell (Minimal) ✅

**Goal:** A working app shell that renders a sidebar, loads pages via dynamic import, and supports prev/next navigation.

**Package:** `tessera` (`src/runtime/`)

### What to Build

#### 4a. App.svelte (Real Implementation)

Replace the placeholder App.svelte. On mount:
1. Import manifest from `virtual:tessera-manifest`
2. Import config from `virtual:tessera-config`
3. Apply branding (Step 3e)
4. Navigate to first page

Render:
- Sidebar (desktop) / hamburger menu (mobile)
- Content area with dynamically loaded page
- Prev/next buttons
- Progress bar (percentage of pages visited — simple counter for now, no store yet)

#### 4b. Page Loading

When the current page changes:
1. Read manifest entry for the target page index
2. Set Svelte context: `setContext('tessera-page', { quiz: manifestEntry.quiz })`
3. Show loading skeleton while importing
4. Dynamically import the page component
5. Mount the new component into the content area, unmount previous

**Page mounting pattern** (idiomatic Svelte 5):

```ts
// In App.svelte
let PageComponent = $state<Component | null>(null);
let pageLoading = $state(false);
let pageError = $state<Error | null>(null);

$effect(() => {
  const index = nav.currentPageIndex;
  pageLoading = true;
  pageError = null;
  PageComponent = null;

  import(manifest.pages[index].importPath).then(mod => {
    PageComponent = mod.default;
    pageLoading = false;
  }).catch(err => {
    console.error(`Tessera: Failed to load page ${index}`, err);
    pageError = err;
    pageLoading = false;
  });
});
```

```svelte
<!-- In template -->
<div class="tessera-content">
  {#if pageLoading}
    <LoadingSkeleton />
  {:else if pageError}
    <ErrorPage error={pageError} onretry={() => nav.goToPage(nav.currentPageIndex)} />
  {:else if PageComponent}
    <PageComponent />
  {/if}
</div>
```

**`LoadingSkeleton.svelte`:** Lightweight CSS-only component with pulsing gray bars mimicking a content layout. If the page hasn't loaded after 5 seconds, show a "Still loading…" message. No JS animation or spinner library.

**`ErrorPage.svelte`:** Displays "This page failed to load. Try navigating to another page or refreshing." with a Retry button that re-attempts the import, and prev/next buttons that still work. Prevents a single broken page from crashing the entire course.

#### 4c. Sidebar Component

`Sidebar.svelte`:
- **Logo and title header:** if `config.branding.logo` is set, render `<img>` at the top of the sidebar (max-height constrained, centered). Course title rendered below or beside the logo as `<h1>`. On mobile, logo and title appear at the top of the slide-out panel.

```svelte
{#if config.branding?.logo}
  <img src={config.branding.logo} alt={config.title} class="tessera-sidebar-logo" />
{/if}
<h1 class="tessera-sidebar-title">{config.title}</h1>
```

- Renders manifest as a collapsible tree: sections → lessons → pages
- Sections are collapsible headers, lessons are sub-groups, pages are clickable items
- Current page highlighted with `aria-current="page"`
- Click handler calls page navigation (simple index-based for now)
- Mobile: hidden by default, slides in as overlay from left via hamburger toggle button
- Hamburger button visible only at mobile breakpoint

#### 4d. Prev/Next Buttons

Simple navigation — no locking logic yet:
- Previous: go to `currentIndex - 1`, disabled at index 0
- Next: go to `currentIndex + 1`, disabled at last page
- Positioned below content area
- Mobile: full-width, prominent

#### 4e. Progress Bar

Simple visual:
- Track how many unique pages have been viewed (simple Set)
- Display as `viewedCount / totalPages` percentage bar
- Fixed to bottom of app shell

### Acceptance Criteria

- App shell renders with sidebar, content area, progress bar, prev/next
- Clicking a page in the sidebar loads that page's content
- Prev/next buttons navigate sequentially through all pages
- Progress bar fills as new pages are visited
- Sidebar collapses to hamburger on mobile viewport
- Hamburger menu opens/closes sidebar overlay on mobile
- Page context is set (verify by adding a test page that reads `getContext('tessera-page')`)

---

## Step 5: Simple Components

**Goal:** All non-quiz components built, styled, accessible, and exported.

Build each component group as a separate sub-task. Test each after building.

### 5a. Callout

| Component | Props | Notes |
|-----------|-------|-------|
| `<Callout>` | `type: "info" \| "warning" \| "tip" \| "important"` | Styled box with icon. Children = content. |

- Distinct visual style per type (color, icon)
- Uses `--tessera-*` custom properties
- `role="note"`, appropriate `aria-label` per type

### 5b. Image

| Component | Props | Notes |
|-----------|-------|-------|
| `<Image>` | `src`, `alt`, `caption?` | Lazy loading via `loading="lazy"`. `src` supports `$assets/` paths. |

- Renders `<figure>` with `<img>` and optional `<figcaption>`
- `loading="lazy"` attribute
- Responsive: `max-width: 100%`

### 5c. Accordion

| Component | Props | Notes |
|-----------|-------|-------|
| `<Accordion>` | — | Container. Children = `<AccordionItem>` components. |
| `<AccordionItem>` | `title` | Expandable panel. |

- `<button>` trigger with `aria-expanded`, `aria-controls`
- Content panel with `role="region"`, `aria-labelledby`
- Keyboard: Enter/Space to toggle
- Animated expand/collapse (CSS transition on `max-height` or `grid-template-rows`)
- Only one item open at a time (controlled via Svelte context in `<Accordion>`)

### 5d. Carousel

| Component | Props | Notes |
|-----------|-------|-------|
| `<Carousel>` | — | Container. Children = `<CarouselSlide>` components. |
| `<CarouselSlide>` | — | Single slide. Children = content. |

- Slide indicators (dots) showing current/total
- Prev/next arrow buttons
- `role="region"`, `aria-roledescription="carousel"`, `aria-label`
- Each slide: `role="tabpanel"`
- Keyboard: arrow keys to navigate slides
- Touch: swipe gesture on mobile
- Responsive: slides fill container width

### 5e. RevealModal

| Component | Props | Notes |
|-----------|-------|-------|
| `<RevealModal>` | `title?`, `trigger` (snippet), `content` (snippet) | Uses Svelte 5 snippets for trigger and modal content. |

**Usage:**
```svelte
<RevealModal title="More Details">
  {#snippet trigger()}
    <button>Click to reveal</button>
  {/snippet}
  {#snippet content()}
    <p>This appears in the modal.</p>
  {/snippet}
</RevealModal>
```

**Internal structure:**
```svelte
<script>
  let { trigger, content, title = '' } = $props();
  let open = $state(false);
</script>

<div onclick={() => open = true} onkeydown={handleKey} role="button" tabindex="0">
  {@render trigger()}
</div>

{#if open}
  <div class="tessera-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div class="tessera-modal-content">
      {@render content()}
      <button onclick={() => open = false}>Close</button>
    </div>
  </div>
{/if}
```

- Click/Enter/Space on trigger opens modal
- Modal: overlay with content panel. `role="dialog"`, `aria-modal="true"`, `aria-label`
- Focus trap inside modal (tab cycles within modal)
- Escape to close, click outside to close
- Scroll lock on body when open
- Animated open/close

### 5f. Video

| Component | Props | Notes |
|-----------|-------|-------|
| `<Video>` | `src`, `title?` | YouTube/Vimeo URL → iframe. Otherwise → `<video>`. |

- URL detection: regex for youtube.com, youtu.be, vimeo.com → render responsive iframe embed (16:9 aspect ratio)
- Local/other URLs → `<video controls>` with `<source>`
- Lazy load: Intersection Observer, load iframe/video only when in viewport
- `title` used as `aria-label`

### 5g. Audio

| Component | Props | Notes |
|-----------|-------|-------|
| `<Audio>` | `src`, `title?` | Native `<audio>` with controls. |

- `<audio controls>` with `<source>`
- `title` rendered as label above player
- `aria-label` from title

### 5h. Component Export

Create `src/components/index.ts`:
```ts
export { default as Callout } from './Callout.svelte';
export { default as Image } from './Image.svelte';
export { default as Accordion } from './Accordion.svelte';
export { default as AccordionItem } from './AccordionItem.svelte';
export { default as Carousel } from './Carousel.svelte';
export { default as CarouselSlide } from './CarouselSlide.svelte';
export { default as RevealModal } from './RevealModal.svelte';
export { default as Video } from './Video.svelte';
export { default as Audio } from './Audio.svelte';
```

### Acceptance Criteria (per component)

- Renders correctly in test project pages
- Passes axe-core accessibility audit (run via Playwright + @axe-core/playwright)
- Keyboard-navigable (tab, enter/space, escape where applicable)
- Responsive across desktop/tablet/mobile breakpoints
- Styled consistently using `--tessera-*` custom properties

### Acceptance Criteria (overall)

- All components importable from `tessera`: `import { Callout, Accordion } from 'tessera'`
- Test project has pages demonstrating every component
- All component pages pass accessibility audit

---

## Step 6: Navigation & Progress State ✅

**Goal:** Reactive state classes for navigation and progress, with unit-tested logic.

**Package:** `tessera` (`src/runtime/`)

### What to Build

#### 6a. Navigation State

`src/runtime/navigation.svelte.ts`:

```ts
export class NavigationState {
  manifest = $state<Manifest>(null!);
  currentPageIndex = $state(0);

  canGoPrev = $derived(this.currentPageIndex > 0);
  canGoNext = $derived(/* depends on mode — see below */);

  constructor(manifest: Manifest) {
    this.manifest = manifest;
  }

  goToPage(index: number) {
    if (index < 0 || index >= this.manifest.totalPages) return;
    this.currentPageIndex = index;
  }

  goNext() { if (this.canGoNext) this.goToPage(this.currentPageIndex + 1); }
  goPrev() { if (this.canGoPrev) this.goToPage(this.currentPageIndex - 1); }
}
```

#### 6b. Progress State

`src/runtime/progress.svelte.ts`:

```ts
export class ProgressState {
  visitedPages = $state(new Set<number>());
  quizScores = $state(new Map<number, number>());
  completionStatus = $state<'incomplete' | 'complete'>('incomplete');
  successStatus = $state<'unknown' | 'passed' | 'failed'>('unknown');

  markVisited(pageIndex: number) {
    this.visitedPages = new Set([...this.visitedPages, pageIndex]);
  }

  quizCompleted(pageIndex: number, score: number) {
    this.quizScores = new Map([...this.quizScores, [pageIndex, score]]);
    this.recalculateCompletion();
    this.recalculateSuccess();
  }

  recalculateCompletion() {
    // reads config.completion.mode
    // "percentage": check visitedPages.size / totalPages >= threshold
    // "quiz": check average quiz score >= passingScore
  }

  recalculateSuccess() {
    // if any graded quizzes exist:
    //   gradedIndices = all page indices with quiz.graded === true
    //   completedGraded = gradedIndices where quizScores.has(index)
    //   average = sum of completed scores / gradedIndices.length
    //   (denominator is TOTAL graded quizzes, not just completed — unattempted count as 0)
    //   successStatus = average >= passingScore ? 'passed' : 'failed'
    // runs regardless of completion.mode
  }
}
```

#### 6c. Page Completion Logic

```ts
function isPageComplete(index: number, manifest: Manifest, progress: ProgressState, config: CourseConfig): boolean {
  const page = manifest.pages[index];
  if (!page.quiz) return progress.visitedPages.has(index);
  if (!page.quiz.gatesProgress) return progress.quizScores.has(index);
  return (progress.quizScores.get(index) ?? 0) >= config.scoring.passingScore;
}
```

For behavioral rules, see design doc § Progress Tracking & Bookmarking → Page Completion.

#### 6d. Navigation Locking Logic

Behavioral rules: see design doc § Navigation Modes.

**Algorithm — Sequential mode:**
```ts
canGoNext = $derived(isPageComplete(this.currentPageIndex, manifest, progress, config));

function isPageLocked(index: number): boolean {
  for (let i = 0; i < index; i++) {
    if (!isPageComplete(i, manifest, progress, config)) return true;
  }
  return false;
}
```

**Algorithm — Free mode:**
```ts
canGoNext = $derived.by(() => {
  const next = this.currentPageIndex + 1;
  return next < manifest.totalPages && !isPageLocked(next);
});

function isPageLocked(index: number): boolean {
  // Scan backwards for nearest gating quiz
  for (let i = index - 1; i >= 0; i--) {
    const page = manifest.pages[i];
    if (page.quiz?.gatesProgress) {
      return (progress.quizScores.get(i) ?? 0) < config.scoring.passingScore;
    }
  }
  return false;
}
```

### Acceptance Criteria

- Unit tests for `NavigationState`:
  - `goToPage` updates `currentPageIndex`
  - `canGoPrev` is false at index 0, true otherwise
  - `canGoNext` respects sequential mode locking
  - `canGoNext` respects quiz gates in free mode
  - `goToPage` with out-of-range index is no-op
- Unit tests for `ProgressState`:
  - `markVisited` adds to set
  - `quizCompleted` stores score and triggers recalculation
  - `recalculateCompletion` with "percentage" mode: correct threshold check
  - `recalculateCompletion` with "quiz" mode: correct average check
  - `recalculateSuccess` computes correct pass/fail independent of completion mode
- Unit tests for `isPageComplete` and `isPageLocked` with various manifest configurations

---

## Step 7: Wire State to App Shell ✅

**Goal:** Connect the state classes to the app shell so navigation, progress, and locking work end-to-end.

### What to Build

#### 7a. Integrate State into App.svelte

1. Instantiate `NavigationState`, `ProgressState`, and `DurationTracker` on mount
2. Use `$effect` to react to `currentPageIndex` changes:
   - Call `progress.markVisited(nav.currentPageIndex)`
   - Trigger page loading (dynamic import, context, mount)
   - Trigger persistence (Step 9)
3. Pass state to sidebar and prev/next buttons

**Duration tracking** — create `src/runtime/duration.ts`:

```ts
export class DurationTracker {
  #startTime = Date.now();
  #accumulated = 0; // restored from saved state

  constructor(previousSeconds: number = 0) {
    this.#accumulated = previousSeconds;
  }

  get totalSeconds(): number {
    return this.#accumulated + Math.floor((Date.now() - this.#startTime) / 1000);
  }
}
```

Instantiate on init with `previousSeconds` from saved state. Call `adapter.setDuration(duration.totalSeconds)` alongside every `adapter.commit()` and in the terminate handler.

**Score and completion reporting** — wire `$effect` watchers that bridge state to persistence:

```ts
// Report score and success status when quiz scores change
$effect(() => {
  const scores = progress.quizScores;
  if (scores.size === 0) return;

  const gradedQuizIndices = manifest.pages.filter(p => p.quiz?.graded).map(p => p.index);
  const completedGraded = gradedQuizIndices.filter(i => scores.has(i));
  if (completedGraded.length === 0) return;

  // Divide by TOTAL graded quizzes, not just completed ones
  // Unattempted quizzes count as 0 — prevents premature "passed"
  const average = completedGraded.reduce((sum, i) => sum + scores.get(i)!, 0) / gradedQuizIndices.length;

  adapter.setScore(Math.round(average));
  adapter.setSuccessStatus(average >= config.scoring.passingScore ? 'passed' : 'failed');
  adapter.setDuration(duration.totalSeconds);
  adapter.commit();
});

// Report completion status when it changes
$effect(() => {
  adapter.setCompletionStatus(progress.completionStatus);
  adapter.setDuration(duration.totalSeconds);
  adapter.commit();
});
```

#### 7b. Update Sidebar

- Read `isPageLocked(index)` for each page item
- Locked pages: `aria-disabled="true"`, grayed out, click handler returns early
- Clicking an unlocked page calls `nav.goToPage(index)`

#### 7c. Update Prev/Next

- Disabled state reads from `nav.canGoPrev` / `nav.canGoNext`
- Click handlers call `nav.goPrev()` / `nav.goNext()`

#### 7c-ii. Keyboard Shortcuts

Add a `keydown` listener on `window`:

```ts
function handleKeyNav(e: KeyboardEvent) {
  // Don't intercept when focus is inside interactive elements
  const tag = (e.target as HTMLElement)?.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if ((e.target as HTMLElement)?.closest('[role="radiogroup"], [role="dialog"], .tessera-accordion, .tessera-carousel')) return;

  if (e.key === 'ArrowLeft') nav.goPrev();
  if (e.key === 'ArrowRight') nav.goNext();
}

window.addEventListener('keydown', handleKeyNav);
```

Clean up listener on unmount.

#### 7d. Update Progress Bar

- Reads `progress.visitedPages.size / manifest.totalPages`

#### 7e. Test Both Navigation Modes

Update `test-project/course.config.js` to test:
1. `navigation.mode: "free"` — all pages clickable
2. `navigation.mode: "sequential"` — only next sequential page unlockable

### Acceptance Criteria

- Sequential mode: can't skip ahead, pages unlock one at a time
- Free mode: all pages clickable in sidebar
- Prev/next buttons disable at boundaries and when locked
- Progress bar updates as pages are visited
- Sidebar correctly shows locked/unlocked state
- Mobile navigation still works (hamburger menu, prev/next)

---

## Step 8: Quiz Components

**Goal:** Quiz, MultipleChoice, FillInTheBlank, and Matching components working end-to-end.

### What to Build

#### 8a. Quiz Component

`<Quiz>` — container that manages quiz flow. Behavior: see design doc § Quiz Flow, Scoring Model, Feedback Model.

**Implementation details:**

1. On mount: read quiz config from `getContext('tessera-page').quiz`
2. Collect child question components via Svelte context: Quiz provides a `registerQuestion` function via `setContext`, each question component calls it on mount to register itself
3. State (`$state`): `currentQuestionIndex`, `answers` (Map<number, any>), `submitted`, `score`, `attemptCount`, `reviewing`
4. Render one question at a time: use `currentQuestionIndex` to show/hide children
5. Submission: calculate `score = (correctCount / totalCount) × 100`, call `progress.quizCompleted(pageIndex, score)`
6. Retry: reset answers and state, increment `attemptCount`, return to question 1

#### 8b. MultipleChoice

| Prop | Type | Notes |
|------|------|-------|
| `question` | `string` | Question text |
| `options` | `string[]` | Answer options |
| `correct` | `number` | Index of correct option |
| `correctFeedback?` | `string` | Shown when correct (review mode) |
| `incorrectFeedback?` | `string` | Shown when incorrect (review mode) |
| `optionFeedback?` | `string[]` | Per-option feedback (review mode) |

- Radio button group (`<input type="radio">`)
- `role="radiogroup"`, `aria-labelledby` question
- Keyboard: arrow keys to select, tab to move between question and nav buttons
- On answer: register with Quiz via context
- Review mode: highlight correct option green, selected-wrong red, show feedback text

#### 8c. FillInTheBlank

| Prop | Type | Notes |
|------|------|-------|
| `question` | `string` | Question text |
| `answers` | `string[]` | Acceptable answers |
| `caseSensitive?` | `boolean` | Default: `false` |
| `correctFeedback?` | `string` | Shown when correct |
| `incorrectFeedback?` | `string` | Shown when incorrect |

- Text input (`<input type="text">`)
- Checking: trim whitespace, compare against all items in `answers` array
- Case-insensitive by default
- Review mode: show entered answer, correct answer(s), feedback

#### 8d. Matching

| Prop | Type | Notes |
|------|------|-------|
| `question` | `string` | Question text |
| `pairs` | `{left: string, right: string}[]` | Correct pairs |
| `correctFeedback?` | `string` | Shown when all correct |
| `incorrectFeedback?` | `string` | Shown when any incorrect |

- Display: left column (fixed order) and right column (shuffled)
- **Desktop:** click left item, then click right item to match. Or drag-and-drop.
- **Mobile:** tap left item (highlights), tap right item to match. No drag-and-drop.
- Visual: matched pairs connected with line/color coding
- Ability to unmatch (click matched pair to disconnect)
- Scoring: all pairs correct = correct, any wrong = incorrect
- Review mode: show correct pairs, highlight wrong matches

#### 8e. Component Export Update

Add to `src/components/index.ts`:
```ts
export { default as Quiz } from './Quiz.svelte';
export { default as MultipleChoice } from './MultipleChoice.svelte';
export { default as FillInTheBlank } from './FillInTheBlank.svelte';
export { default as Matching } from './Matching.svelte';
```

#### 8f. Test Quiz Page

Add a quiz page to `test-project/` with `pageConfig.quiz` and all three question types.

### Acceptance Criteria

- Quiz shows one question at a time with back/next/submit buttons
- Progress indicator shows current/total
- Submitting calculates correct score
- Results screen shows score and pass/fail
- Review mode shows correct/incorrect per question with feedback
- Retry resets and allows new attempt
- `maxAttempts` is enforced (retry button hidden when exhausted)
- `gatesProgress: true` blocks next page until passed (test with sequential mode)
- All quiz components pass accessibility audit
- Mobile: buttons fixed to bottom, compact progress, tap-to-select matching
- Score is recorded in `ProgressState.quizScores`

---

## Step 9: Persistence — Web Adapter (localStorage)

**Goal:** Course state survives page reloads via localStorage.

### What to Build

#### 9a. Persistence API

`src/runtime/persistence.ts`:

```ts
export interface PersistenceAdapter {
  init(): Promise<void>;
  getState(): SavedState | null;
  saveState(state: SavedState): void;
  setScore(score: number): void;
  setCompletionStatus(status: 'incomplete' | 'complete'): void;
  setSuccessStatus(status: 'passed' | 'failed'): void;
  setDuration(seconds: number): void;
  commit(): void;
  terminate(): void;
}

export interface SavedState {
  b: number;                    // bookmark — page index
  v: number[];                  // visited — array of page indices
  q: Record<string, number>;   // quiz scores — pageIndex: score
  d: number;                    // duration — accumulated seconds
}
```

#### 9b. Web Adapter

`src/runtime/adapters/web.ts`:

- `init()`: read from `localStorage` key `tessera-{courseId}` (derive courseId from config title, slugified)
- `getState()`: parse JSON from localStorage, return `SavedState` or null
- `saveState(state)`: serialize to JSON, write to localStorage
- `setScore/setCompletionStatus/setSuccessStatus/setDuration`: no-ops
- `commit()`: no-op (localStorage writes are synchronous)
- `terminate()`: no-op

#### 9c. Wire Persistence to State

In `App.svelte` init:
1. Create adapter — use `WebAdapter` directly in this step. (Step 10 introduces `createAdapter()` which selects the correct adapter based on `config.export.standard`.) Call `init()`.
2. Read saved state: populate `NavigationState.currentPageIndex`, `ProgressState.visitedPages`, `ProgressState.quizScores`
3. Create `DurationTracker` with `savedState.d` (accumulated seconds)
4. Recalculate completion/success from restored state

On state changes (via `$effect`):
- When `currentPageIndex` changes → `saveState()`
- When `visitedPages` changes → `saveState()`
- When `quizScores` changes → `saveState()`

`saveState()` always includes `d: duration.totalSeconds` in the serialized state.

#### 9d. Exit / Terminate Lifecycle

```ts
let terminated = false;

function handleExit() {
  if (terminated) return;
  terminated = true;
  adapter.saveState(serializeState());
  adapter.setDuration(duration.totalSeconds);
  adapter.commit();
  adapter.terminate();
}

// pagehide fires reliably on mobile and tab close
window.addEventListener('pagehide', handleExit);
// beforeunload as fallback for older browsers
window.addEventListener('beforeunload', handleExit);
```

The `terminated` flag ensures `adapter.terminate()` is called at most once. All adapters must be idempotent on `terminate()` — no-op if already terminated.

#### 9e. Serialization

```json
{
  "b": 5,
  "v": [0,1,2,3,4,5],
  "q": {"3": 85, "7": 90},
  "d": 1234
}
```

Compact format per design doc § State Persistence. Single-letter keys, integer page indices, duration in seconds.

### Acceptance Criteria

- Navigate to page 3, refresh browser → returns to page 3
- Visit 5 pages, refresh → progress bar still shows 5 pages visited
- Complete a quiz with score 85, refresh → quiz score is preserved, completion/success recalculated
- Clear localStorage → course starts fresh
- State serialization for a 200-page course with 5 quizzes is under 4096 characters

---

## Step 10: Persistence — LMS Adapters

**Goal:** SCORM 1.2, SCORM 2004, and CMI5 adapters implementing the same `PersistenceAdapter` interface.

### What to Build

#### 10a. SCORM 1.2 Adapter

`src/runtime/adapters/scorm12.ts`:

- `init()`: discover API via `window.API` (walk up `window.opener` and `window.parent` chain, max 10 levels). Call `LMSInitialize("")`.
- `getState()`: `LMSGetValue("cmi.suspend_data")` → parse JSON
- `saveState(state)`: `LMSSetValue("cmi.suspend_data", JSON.stringify(state))`
- `setScore(score)`:
  ```ts
  this.api.LMSSetValue('cmi.core.score.raw', String(score));
  this.api.LMSSetValue('cmi.core.score.min', '0');
  this.api.LMSSetValue('cmi.core.score.max', '100');
  ```
- `setCompletionStatus(status)` and `setSuccessStatus(status)`: SCORM 1.2 combines both in a single `cmi.core.lesson_status` field. The adapter must reconcile:
  ```ts
  #completionStatus: string = 'incomplete';
  #successStatus: string | null = null;

  setCompletionStatus(status: 'incomplete' | 'complete') {
    this.#completionStatus = status === 'complete' ? 'completed' : 'incomplete';
    this.#flushLessonStatus();
  }

  setSuccessStatus(status: 'passed' | 'failed') {
    this.#successStatus = status;
    this.#flushLessonStatus();
  }

  #flushLessonStatus() {
    // Success status takes priority — it's the more specific status
    if (this.#successStatus) {
      this.api.LMSSetValue('cmi.core.lesson_status', this.#successStatus);
    } else {
      this.api.LMSSetValue('cmi.core.lesson_status', this.#completionStatus);
    }
  }
  ```
- `setDuration(seconds)`: `LMSSetValue("cmi.core.session_time", formatHHMMSS(seconds))`
- `commit()`: `LMSCommit("")`
- `terminate()`: flush → `LMSFinish("")`

Duration format: `HHHH:MM:SS.SS`

#### 10b. SCORM 2004 Adapter

`src/runtime/adapters/scorm2004.ts`:

- `init()`: discover API via `window.API_1484_11` (same chain walk). Call `Initialize("")`.
- `getState()`: `GetValue("cmi.suspend_data")` → parse JSON
- `saveState(state)`: `SetValue("cmi.suspend_data", JSON.stringify(state))`
- `setScore(score)`:
  ```ts
  this.api.SetValue('cmi.score.raw', String(score));
  this.api.SetValue('cmi.score.min', '0');
  this.api.SetValue('cmi.score.max', '100');
  this.api.SetValue('cmi.score.scaled', String(score / 100));
  ```
- `setCompletionStatus(status)`: `SetValue("cmi.completion_status", status === 'complete' ? 'completed' : 'incomplete')`
- `setSuccessStatus(status)`: `SetValue("cmi.success_status", status)`
- `setDuration(seconds)`: `SetValue("cmi.session_time", formatISO8601Duration(seconds))`

```ts
// Note: cmi.completion_threshold and cmi.scaled_passing_score are typically
// set by the LMS, not the SCO. Tessera manages completion and passing
// logic internally via course.config.js settings.
```
- `commit()`: `Commit("")`
- `terminate()`: flush → `Terminate("")`

Duration format: ISO 8601 (`PT1H30M45S`)

#### 10c. CMI5 Adapter

`src/runtime/adapters/cmi5.ts`:

**Launch parameter parsing:**
```ts
const params = new URLSearchParams(window.location.search);
const fetchUrl = params.get('fetch');       // URL to get auth token
const endpoint = params.get('endpoint');     // xAPI endpoint
const registration = params.get('registration');
const activityId = params.get('activityId');
const actor = JSON.parse(params.get('actor')!);
```

**Auth handling:** The `fetch` URL returns a bearer token. Include as `Authorization: Bearer {token}` header on all xAPI requests. CMI5 tokens don't expire during a session — no refresh needed. If a request fails with 401, fall back to web adapter.

**xAPI verb IRIs:**
```ts
const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
};
```

**Statement builder:**
```ts
function buildStatement(verb: string, result?: object) {
  return {
    actor: this.actor,
    verb: { id: verb, display: { 'en-US': verb.split('/').pop() } },
    object: { id: this.activityId, objectType: 'Activity' },
    context: {
      registration: this.registration,
      contextActivities: {
        grouping: [{ id: this.activityId }]
      }
    },
    ...(result && { result }),
  };
}
```

**Adapter methods:**
- `init()`: parse launch params (above). POST to `fetchUrl` to get auth token. Send `Initialized` statement via xAPI.
- `getState()`: GET from xAPI State API (`endpoint/activities/state?activityId=...&agent=...&stateId=tessera-state`) → parse JSON
- `saveState(state)`: PUT to xAPI State API (same URL, JSON body)
- `setScore(score)`: stored internally for inclusion in completion/pass/fail statements
- `setCompletionStatus(status)`: if `complete`, send `Completed` statement with `result: { completion: true, duration: formatISO8601(seconds), score: { scaled: score/100 } }`
- `setSuccessStatus(status)`: send `Passed` or `Failed` statement with `result: { success: status === 'passed', score: { scaled: score/100 }, duration: formatISO8601(seconds) }`
- `setDuration(seconds)`: stored internally for inclusion in statements
- `commit()`: no-op (xAPI calls are sent individually per statement)
- `terminate()`: send `Terminated` statement. Guard with `terminated` flag to prevent duplicate sends.

#### 10d. Error Handling

Wrap all LMS adapter calls (not web adapter):

```ts
async function withRetry(fn: () => any, maxRetries = 3): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = fn();
    if (result !== false && result !== "false") return true;
    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
  }
  console.warn('Tessera: LMS call failed after retries, continuing without persistence');
  return false;
}
```

Write queue:
- State changes are enqueued as operations
- Flush sequentially; if an operation fails after retries, stop and retry on next trigger
- Graceful degradation: course continues functioning if persistence fails entirely

#### 10e. Adapter Selection

In `App.svelte` init, select adapter based on build-time config:

```ts
function createAdapter(config: CourseConfig): PersistenceAdapter {
  switch (config.export.standard) {
    case 'scorm12':
      const api12 = findSCORM12API();
      return api12 ? new SCORM12Adapter(api12) : new WebAdapter(config);
    case 'scorm2004':
      const api2004 = findSCORM2004API();
      return api2004 ? new SCORM2004Adapter(api2004) : new WebAdapter(config);
    case 'cmi5':
      return hasCMI5LaunchParams() ? new CMI5Adapter() : new WebAdapter(config);
    default:
      return new WebAdapter(config);
  }
}
```

Primary adapter from config; fallback to web adapter if LMS API not found.

### Acceptance Criteria

- SCORM 1.2: full round-trip with SCORM Cloud (upload, launch, navigate, close, re-launch → state restored)
- SCORM 2004: same round-trip
- CMI5: same round-trip
- Fallback: SCORM build opened locally without LMS → falls back to localStorage, no errors
- Error handling: simulate failed `LMSSetValue` → retries 3x, course continues
- Score and completion/success status reported correctly to LMS

---

## Step 11: Validation

**Goal:** Build-time validation with clear, actionable error messages.

### What to Build

#### 11a. Validation Plugin (`tessera:validation`)

Add `tesseraValidationPlugin()` to the plugin array. Runs during both `configResolved` (dev) and `buildStart` (build).

Calls a `validateProject(projectRoot)` function that returns `{ errors: string[], warnings: string[] }`.

#### 11b. Validation Rules

| Check | Severity | Message Pattern |
|-------|----------|-----------------|
| `course.config.js` missing | Error | `course.config.js not found in project root` |
| Unknown config fields | Warning | `course.config.js: unknown field "xyz" — will be ignored` |
| Invalid `navigation.mode` | Error | `course.config.js: "navigation.mode" must be "free" or "sequential", got "..."` |
| Invalid `completion.mode` | Error | `course.config.js: "completion.mode" must be "quiz" or "percentage", got "..."` |
| Invalid `export.standard` | Error | `course.config.js: "export.standard" must be "web", "scorm12", "scorm2004", or "cmi5", got "..."` |
| `passingScore` out of range | Error | `course.config.js: "scoring.passingScore" must be 0–100, got ...` |
| `percentageThreshold` out of range | Error | `course.config.js: "completion.percentageThreshold" must be 0–100, got ...` |
| `_meta.js` invalid syntax | Error | `pages/01-intro/_meta.js: syntax error — must export default { title: "..." }` |
| `_meta.js` missing title | Error | `pages/01-intro/_meta.js: missing required "title" field` |
| `pages` array references missing file | Error | `pages/.../01-welcome/_meta.js: pages array lists "quiz" but quiz.svelte not found in this directory` |
| `pageConfig` not static literal | Error | `pages/.../file.svelte: pageConfig must be a static object literal (no variables, function calls, or computed values)` |
| `quiz.maxAttempts` invalid | Error | `pages/.../file.svelte: quiz.maxAttempts must be a positive number or Infinity, got ...` |
| `quiz.graded` not boolean | Error | `pages/.../file.svelte: quiz.graded must be a boolean, got ...` |
| `.svelte` outside hierarchy | Warning | `pages/stray-file.svelte: this file is outside the section/lesson structure and will be ignored` |
| Unlisted `.svelte` in lesson | Warning | `pages/.../01-welcome/extras.svelte: not listed in _meta.js pages array — will be appended at end` |
| Asset path unresolved | Warning | `pages/.../file.svelte: "$assets/missing.png" not found in assets/ directory` |
| `completion.mode: "quiz"` but no graded quizzes | Error | `completion.mode is "quiz" but no pages have quiz config with graded: true` |
| Empty course | Error | `No pages found. Create at least one section with a lesson and page in pages/` |
| SCORM 1.2 + high page count | Warning | `Course has N pages with M quizzes — SCORM 1.2 suspend_data limit (4KB) may be exceeded. Consider using "scorm2004" or "cmi5".` |

#### 11c. Error Reporting

- Errors: print with red prefix `[tessera error]`, then block build / prevent dev server start
- Warnings: print with yellow prefix `[tessera warning]`, don't block
- Each message includes file path and specific fix suggestion

### Acceptance Criteria

- Unit tests for every validation rule (provide bad input, verify correct error/warning)
- Errors block `pnpm build` with non-zero exit code
- Warnings print but don't block
- Missing `course.config.js` produces clear error, not a stack trace
- Invalid `pageConfig` (e.g., `export const pageConfig = getConfig()`) produces the "static literal" error

---

## Step 12: Export Tooling

**Goal:** `npm run export` produces valid deployable packages for all four standards.

### What to Build

#### 12a. Export Plugin (`tessera:export`)

Add `tesseraExportPlugin()` to the plugin array. Hooks into `closeBundle` (runs after Vite finishes building to `dist/`).

Read `config.export.standard` to determine output:

#### 12b. Web Export

- No additional work — `dist/` is the final output
- Print: `✓ Web export: dist/ (X.X MB)`

#### 12c. SCORM 1.2 Export

Generate `dist/imsmanifest.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="tessera-course" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-1">
    <organization identifier="org-1">
      <title>{config.title}</title>
      <item identifier="item-1" identifierref="res-1">
        <title>{config.title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      {for each file in dist/: <file href="..." />}
    </resource>
  </resources>
</manifest>
```

Package `dist/` contents into ZIP: `{slugify(config.title)}-{config.version}.zip`

#### 12d. SCORM 2004 Export

Same as SCORM 1.2 but with different schema:
- `xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"`
- `xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"`
- `<schemaversion>2004 4th Edition</schemaversion>`
- `adlcp:scormType="sco"` (capital T)

#### 12e. CMI5 Export

Generate `dist/cmi5.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="{uuid}">
    <title><langstring lang="en-US">{config.title}</langstring></title>
    <description><langstring lang="en-US">{config.description}</langstring></description>
  </course>
  <au id="{uuid}" url="index.html" moveOn="Completed" masteryScore="{config.scoring.passingScore / 100}">
    <title><langstring lang="en-US">{config.title}</langstring></title>
    <description><langstring lang="en-US">{config.description}</langstring></description>
  </au>
</courseStructure>
```

Package into ZIP.

#### 12f. ZIP Packaging

Use `archiver` npm package:
1. Create ZIP stream
2. Add all files from `dist/` recursively
3. Write to project root: `{slugify(config.title)}-{config.version}.zip`
4. Print: `✓ SCORM 1.2 export: my-course-1.0.0.zip (X.X MB)`

### Acceptance Criteria

- `pnpm build` with `export.standard: "web"` → produces `dist/` folder, serveable with any static server
- `pnpm build` with `export.standard: "scorm12"` → produces valid ZIP, uploads to SCORM Cloud, launches correctly
- `pnpm build` with `export.standard: "scorm2004"` → same with SCORM Cloud (2004 mode)
- `pnpm build` with `export.standard: "cmi5"` → produces valid ZIP with `cmi5.xml`
- All assets included in output
- Manifest XML is well-formed (validate with XML parser)

---

## Step 13: Scaffolding CLI (`create-tessera`)

**Goal:** `npx create-tessera my-course` produces a working project.

**Package:** `create-tessera`

### What to Build

#### 13a. CLI Entry

`src/index.ts`:
1. Parse argument: project name (required). Print usage if missing.
2. Check if directory exists → error if so.
3. Create directory.
4. Write all template files (below).
5. Run `npm install` (or `pnpm install` if pnpm detected) in the new directory.
6. Print success message with next steps.

#### 13b. Template Files

**`package.json`:**
```json
{
  "name": "{project-name}",
  "private": true,
  "type": "module",
  "scripts": {
    "preview": "vite dev",
    "export": "vite build"
  },
  "dependencies": {
    "tessera": "^1.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0"
  }
}
```

**`vite.config.js`:**
```js
import { tesseraPlugin } from 'tessera/plugin';
export default { plugins: [tesseraPlugin()] };
```

**`course.config.js`:**
```js
export default {
  title: "{Project Name}",
  description: "",
  author: "",
  version: "1.0.0",
  branding: {
    logo: "",
    primaryColor: "#2563eb",
    fontFamily: "Inter, sans-serif",
  },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};
```

**`pages/01-getting-started/_meta.js`:**
```js
export default { title: "Getting Started" };
```

**`pages/01-getting-started/01-welcome/_meta.js`:**
```js
export default { title: "Welcome", pages: ["welcome"] };
```

**`pages/01-getting-started/01-welcome/welcome.svelte`:**
```svelte
<script context="module">
  export const pageConfig = {
    title: "Welcome"
  };
</script>

<h1>Welcome to {Project Name}</h1>
<p>Start building your course by editing this page or adding new ones.</p>
```

**`styles/custom.css`:** empty file with comment header
**`assets/.gitkeep`:** empty file
**`TESSERA.md`:** LLM instructions (content from Step 14)
**`.gitignore`:** `node_modules`, `dist`, `.DS_Store`

### Acceptance Criteria

- `npx create-tessera test-course` creates directory with all files
- `cd test-course && npm install && npm run preview` starts dev server
- Starter page renders in browser with styled theme
- `npm run export` produces `dist/` folder
- Running on an existing directory prints error, doesn't overwrite

---

## Step 14: TESSERA.md (LLM Instructions)

**Goal:** An instructions file that enables any LLM to produce valid Tessera courses.

**Draft early** (alongside Step 5/8) to validate component APIs. **Finalize** after all steps complete.

### What to Include

1. **Project structure** — section/lesson/page hierarchy, `_meta.js` format (title + pages array), numbered prefix convention for sections/lessons, page files have no prefix
2. **Creating pages** — file naming, `pageConfig` export syntax (must be static literal), where to place files, how to add to `_meta.js` pages array
3. **Component reference** — every component from the canonical list (Step 5 + Step 8) with:
   - Full prop signature with types and defaults
   - A complete usage example (copy-pasteable)
   - Accessibility notes (what's built-in, what the author should add like alt text)
4. **Creating quizzes** — `pageConfig.quiz` config object, `<Quiz>` wrapper, question components, feedback props, graded vs practice, gating
5. **Assets** — use `$assets/` alias, local vs external, supported formats
6. **Styling** — CSS files in `styles/`, available `--tessera-*` custom properties list, how to override
7. **Constraints** — no runtime fetch, no direct store/runtime imports, third-party libs must be project dependencies
8. **Common patterns** — accordion for FAQs, carousel for step-by-step, callout for key takeaways, image with caption
9. **Course configuration** — full `course.config.js` reference with all fields, types, and defaults

### Acceptance Criteria

- An LLM reading only `TESSERA.md` can produce a valid multi-page course with quizzes, interactive components, and proper structure
- No reference to internal runtime details (stores, adapters, virtual modules)
- All component props match the canonical implementation exactly
- Every example is syntactically valid and would render correctly

---

## Step Summary & Dependencies

```
Step 0:  Monorepo setup ──────────────────────────────────────────────
Step 1:  Vite plugin core (virtual entry, config, $assets) ──────────
Step 2:  Manifest generation ─────────────────────────────────────────
Step 3:  Theme & base styles ─────────────────────────────────────────
Step 4:  App shell (sidebar, page loading, prev/next) ────────────────
Step 5:  Simple components (Callout → Audio) ─────────────────────────
Step 6:  Navigation & progress state (unit tested) ───────────────────
Step 7:  Wire state to app shell (sequential, free, gating) ──────────
Step 8:  Quiz components (Quiz, MC, FitB, Matching) ──────────────────
Step 9:  Persistence — localStorage ──────────────────────────────────
Step 10: Persistence — SCORM 1.2, 2004, CMI5 ────────────────────────
Step 11: Validation ──────────────────────────────────────────────────
Step 12: Export tooling (manifests, ZIP) ─────────────────────────────
Step 13: Scaffolding CLI (create-tessera) ────────────────────────────
Step 14: TESSERA.md (draft early, finalize last) ─────────────────────
Step 15: End-to-end tests (Playwright) ───────────────────────────────
```

Each step builds on the previous. Every step has acceptance criteria that can be tested before proceeding.

**Step 14 (TESSERA.md) should be drafted alongside Steps 5 and 8** to validate component APIs from the LLM's perspective. If a prop signature is awkward to explain, it's awkward to use — iterate before finalizing. Complete the final pass after Step 13.

---

## Step 15: End-to-End Tests

**Goal:** Playwright E2E tests covering critical user flows across the full stack.

### What to Build

#### 15a. Test Infrastructure

- Create `test-project-e2e/` alongside `test-project/` with a full multi-section course including informational pages, interactive components, and graded/practice quizzes
- Playwright tests live in `tests/e2e/`
- Tests run against `vite dev` of the E2E test project
- Add `pnpm test:e2e` to root `package.json` scripts

#### 15b. Navigation E2E

- **Free mode:** click any sidebar page → content loads correctly
- **Sequential mode:** verify locked pages can't be clicked, pages unlock by visiting in order
- **Prev/next buttons:** navigate end-to-end through all pages, disabled at boundaries
- **Keyboard shortcuts:** Left/Right arrow keys navigate prev/next, ignored when focus is in input
- **Mobile:** hamburger opens sidebar, selecting page closes sidebar and loads content

#### 15c. Quiz E2E

- Complete a quiz with all correct answers → score shows 100% on results screen
- Complete a quiz with some wrong answers → correct score percentage displayed
- Fail a gated quiz → next page is locked; pass → next page unlocks
- Review mode: after submission with `showFeedback: true`, step through questions and verify correct/incorrect indicators and feedback text
- Retry flow: fail → retry button appears → retry → new score replaces old
- `maxAttempts` exhausted → retry button disappears
- Practice quiz (`graded: false`) → score not reflected in progress/LMS reporting

#### 15d. Persistence E2E

- Navigate to page 5, reload browser → resumes on page 5
- Visit 5 pages, reload → progress bar still shows 5 pages visited
- Complete quiz with score 85, reload → quiz score preserved, completion/success state correct
- Clear localStorage → course starts fresh (page 0, empty progress)

#### 15e. Component E2E

- Accordion: click to expand/collapse, verify only one item open at a time, keyboard accessible
- Carousel: navigate slides via arrows and dots, verify swipe on mobile viewport
- RevealModal: click trigger to open, Escape to close, focus trapped inside modal
- All component pages pass axe-core accessibility audit (`@axe-core/playwright`)

#### 15f. Export E2E

- Web export: run `vite build`, serve `dist/` with a static file server, verify course loads and navigation works
- SCORM 1.2 export: verify ZIP contains valid `imsmanifest.xml` (parse and validate XML structure)
- SCORM 2004 export: verify ZIP contains valid `imsmanifest.xml` with 2004 schema
- CMI5 export: verify ZIP contains valid `cmi5.xml`

### Acceptance Criteria

- All E2E tests pass in CI (headless Chromium)
- Tests cover: navigation (free + sequential), quiz completion + gating + retry, persistence across reload, all interactive components, export output validation
- Mobile viewport tests use Playwright's `viewport` option for 375×667
- Accessibility audit passes on all test pages
