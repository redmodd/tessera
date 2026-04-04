# Tessera — eLearning Authoring Framework

## Overview

Tessera is an npm package that provides a framework for building eLearning courses. Users author courses by chatting with their preferred LLM coding agent (Claude Code, pi, Cursor, etc.) using their own LLM licenses. The LLM reads instructional content provided by the user, asks clarifying questions, and generates a visually polished eLearning course.

Tessera is **not** a chatbot or LLM interface. It is a framework — like Next.js is for web apps — that provides project structure, a component library, a preview server, and LMS-compliant export (SCORM 1.2, SCORM 2004, CMI5). The LLM is the authoring interface, but it is not Tessera's concern.

## Target Users

- **Instructional designers** — have well-designed learning content, want to turn it into an eLearning module without deep technical skills
- **eLearning developers** — technical users who want a faster, AI-assisted authoring workflow

Both users interact with the tool by chatting with their preferred LLM coding agent. The tool must be approachable for non-technical users.

## Authoring Workflow

1. User runs `npx create-tessera my-course` to scaffold a new project
2. User opens the project in their preferred LLM coding agent
3. User provides learning content — by pointing at files (markdown, Word, PDF) or describing it conversationally in chat
4. The LLM reads the content, asks clarifying questions, and generates Svelte pages into the folder structure
5. User runs `npm run preview` to preview the course in a browser with hot reload
6. User iterates via chat — "make this an accordion," "add a quiz here," etc.
7. User runs `npm run export` to get a deployable package

## Tech Stack

- **Svelte 5** — course runtime and component library. Uses runes (`$state`, `$derived`, `$effect`) for reactive state. Compiles to vanilla JS with no runtime, ensuring maximum LMS compatibility and tiny bundle size.
- **Vite** — dev server for preview (hot reload) and build tool for export.
- **Node.js** — CLI tooling for scaffolding and export.
- All dependencies use their latest stable versions.

## Architecture

### SPA with Dynamic Imports

A Tessera course is a **single-page application (SPA)**. The runtime is a persistent Svelte app shell that handles navigation, sidebar, progress tracking, and LMS communication. Individual pages are loaded via **dynamic imports** based on the build-time manifest.

The user's project contains only authored content (pages, styles, assets, config). The app shell (`App.svelte`), entry point (`main.js`), and `index.html` are provided by the Tessera Vite plugin as virtual modules — the user never sees or edits these files.

```
┌─────────────────────────────────────────────┐
│  App Shell (always mounted)                 │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │ Sidebar  │  │ Content Area             │ │
│  │ Nav      │  │ ┌──────────────────────┐ │ │
│  │          │  │ │ Current Page         │ │ │
│  │ Section  │  │ │ (dynamic import)     │ │ │
│  │  Lesson  │  │ │                      │ │ │
│  │   Page ← │  │ │                      │ │ │
│  │   Page   │  │ └──────────────────────┘ │ │
│  │  Lesson  │  │ ┌──────────────────────┐ │ │
│  │          │  │ │ Nav: ← Prev | Next → │ │ │
│  └──────────┘  └──────────────────────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │ Progress Bar                         │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Page lifecycle:**
1. Learner navigates (click sidebar, next/prev, or direct resume)
2. Runtime resolves the target page from the manifest
3. A lightweight loading skeleton (CSS-only pulsing gray bars) is shown in the content area while the page loads. If loading exceeds 5 seconds, a "Still loading…" message appears.
4. Page component is dynamically imported (`import('./pages/01-intro/01-welcome/welcome.svelte')`)
5. Previous page component is unmounted, new page is mounted into the content area. If the import or page render fails, an error fallback is shown ("This page failed to load") with a Retry button and working prev/next navigation.
6. Runtime updates navigation store (current page, recalculate next/prev availability), progress store (mark page visited), and persistence layer (update bookmark)
7. Persistence layer saves state via the appropriate adapter (localStorage for web/preview, SCORM/CMI5 API for LMS)

**Why SPA:** Persistent shell means navigation, progress, and LMS connection survive page transitions. No re-initialization on every page. Sidebar state, scroll position, and progress bar are maintained seamlessly.

### State Management

All runtime state lives in Svelte 5 reactive classes (using runes), organized by concern:

- **Navigation state** — `currentPageIndex` (manifest index), `canGoNext`, `canGoPrev`, `isPageLocked`. Derived from manifest + progress. The current page index also serves as the bookmark — persisted on every navigation.
- **Progress state** — `visitedPages` (Set of page indices), `quizScores` (Map of page index → score), `completionStatus`, `successStatus`. This is the source of truth for all progress.
- **Course config** — parsed `course.config.js` values (via `virtual:tessera-config`), available to all components. Read-only, populated once on app init.

**State persistence:**
- **During preview and web export:** state is persisted via `localStorage`. Progress and bookmarks survive page reloads, giving authors a realistic experience of the learner flow.
- **During LMS playback:** state is persisted via SCORM/CMI5 API calls. Bookmark is saved on every page transition. Scores are saved on quiz completion. Completion/success status is saved when conditions are met.

**Data flow:**
```
User action → Component event → Store update → Side effects
                                    │
                                    ├→ UI reactivity (Svelte auto-updates)
                                    ├→ Navigation recalculation
                                    └→ Persistence (localStorage or LMS API)
```

## npm Packages

Tessera is published as two npm packages:

- **`create-tessera`** — scaffolding CLI. Run via `npx create-tessera my-course`. Creates the project directory, generates `package.json` (with `tessera` as a dependency and `preview`/`export` scripts), creates the starter folder structure (`pages/`, `styles/`, `assets/`), generates a default `course.config.js`, generates the LLM instructions file (`TESSERA.md`), and runs `npm install`.
- **`tessera`** — the framework itself. Contains the Svelte component library, course runtime (navigation, progress tracking, bookmarking, SCORM/CMI5 communication), Vite plugin (manifest generation, virtual entry points, validation, export packaging), default theme/styles, and export tooling.

## Project Structure

A scaffolded Tessera project:

```
my-course/
├── course.config.js            # course metadata, branding, completion, nav, scoring
├── vite.config.js              # imports and registers the Tessera Vite plugin
├── TESSERA.md                  # LLM instructions file
├── styles/                     # user's CSS overrides
│   └── custom.css
├── assets/                     # images, video, audio (local files)
├── pages/
│   ├── 01-introduction/                  # section
│   │   ├── _meta.js                      # { title: "Introduction" }
│   │   ├── 01-welcome/                   # lesson
│   │   │   ├── _meta.js                  # { title: "Welcome", pages: ["welcome", "objectives"] }
│   │   │   ├── welcome.svelte            # page
│   │   │   └── objectives.svelte         # page
│   │   └── 02-getting-started/           # lesson
│   │       ├── _meta.js
│   │       ├── overview.svelte
│   │       └── first-steps.svelte
│   └── 02-core-content/                  # section
│       └── ...
└── package.json
```

Note: `index.html`, `main.js`, and `App.svelte` are not present in the project. The Tessera Vite plugin provides these as virtual modules, keeping the project directory clean — users only see files they author.

### Hierarchy

- **Section** — top-level folder inside `pages/`. Organizational grouping. Has a `_meta.js` for display title.
- **Lesson** — folder inside a section. The primary unit of content. Has a `_meta.js` for display title and page order.
- **Page** — a `.svelte` file inside a lesson folder. Each page is one screen the learner sees.

The folder structure IS the course structure — no separate manifest to keep in sync.

### Ordering

- **Sections and lessons** use numbered prefixes (e.g., `01-introduction/`, `02-core-content/`) for ordering via alphabetical sort.
- **Pages** are ordered by the `pages` array in the lesson's `_meta.js`. This array lists filenames (without `.svelte` extension) in display order. Any `.svelte` files in the lesson folder not listed in `pages` are appended alphabetically after the listed ones.

This keeps section/lesson ordering simple (just rename the prefix) while giving explicit, prefix-free control over page ordering — the level where ordering changes most frequently during authoring.

**Identity and bookmarks:** Internally, the manifest assigns each page a stable integer index based on the resolved order. Bookmarks and state persistence use these indices, not path strings (see State Persistence). If a published course is restructured, existing learner bookmarks will be invalidated — this is inherent to any content restructuring.

### Display Names

- Sections and lessons define their display name in `_meta.js`: `export default { title: "Introduction" }`
- Lesson `_meta.js` also defines page order: `export default { title: "Welcome", pages: ["welcome", "objectives"] }`
- Pages define their display name via `pageConfig` (see Page Content Types below): `export const pageConfig = { title: "Welcome to the Course" }`
- If no title is provided, the fallback is to title-case the filename/folder name (stripping any numeric prefix for sections/lessons).

### Build-Time Manifest

A Vite plugin scans the `pages/` directory at build time, reads the folder structure and `_meta.js` files, and generates a course manifest (JSON). This manifest drives:
- Sidebar navigation rendering
- Next/previous page logic
- Progress tracking (total pages, visited pages)
- Sequential navigation and quiz gate enforcement
- LMS manifest generation on export (`imsmanifest.xml` or `cmi5.xml`)

The folder structure is always the source of truth. During `npm run preview`, the plugin rebuilds the manifest on file changes so hot reload picks up new/renamed pages automatically.

## Course Configuration

`course.config.js` at the project root. This is the single source of truth for all course-level settings. Other sections in this document reference these fields but do not redefine them.

The Vite plugin makes this config available to the runtime as a virtual module (`virtual:tessera-config`), so it is statically bundled into the app — no runtime file reading or async loading required.

```js
export default {
  // Metadata
  title: "My Course",
  description: "Course description",
  author: "Author Name",
  version: "1.0.0",                    // optional

  // Branding
  branding: {
    logo: "$assets/logo.png",
    primaryColor: "#2563eb",
    fontFamily: "Inter, sans-serif",
  },

  // Navigation
  navigation: {
    mode: "free",                       // "free" | "sequential"
  },

  // Completion
  completion: {
    mode: "quiz",                       // "quiz" | "percentage"
    percentageThreshold: 80,            // used when mode is "percentage"
  },

  // Scoring
  scoring: {
    passingScore: 70,                   // pass threshold for quizzes (used for gating and LMS success status)
  },

  // Export
  export: {
    standard: "web",                    // "web" | "scorm12" | "scorm2004" | "cmi5"
  },

}
```

## Page Content Types

All content types are Svelte components shipped with the Tessera npm package. Users never edit framework files — they import and use components in their page `.svelte` files. For full prop signatures, see `implementation.md`.

### Page Configuration

Every page can export a `pageConfig` object that configures the page's behavior. All fields are optional.

```svelte
<script context="module">
  export const pageConfig = {
    // Display
    title: "Welcome to the Course",

    // Quiz settings (presence of these fields makes this a quiz page)
    quiz: {
      graded: true,                 // if false, quiz is practice only (no score reported)
      gatesProgress: true,          // must pass before proceeding (uses course passingScore)
      maxAttempts: 3,               // number of retry attempts (Infinity = unlimited)
      showFeedback: true,           // show correct/incorrect + feedback after each question
    }
  }
</script>
```

For non-quiz pages, only `title` is needed (or omit `pageConfig` entirely to use the filename fallback).

**Constraint:** `pageConfig` must be a static object literal — no computed values, function calls, or variable references. The Vite plugin extracts page configuration at build time via lightweight static analysis of the `export const pageConfig` declaration. Dynamic expressions cannot be evaluated at build time and will cause a validation error.

### Informational Content

- Text, headings, images, diagrams — standard HTML elements styled by Tessera's default theme
- **Callout** — `<Callout>` component with a `type` prop (`"info"`, `"warning"`, `"tip"`, `"important"`). Styled container with icon for highlighting key information.

### Interactive Components

- **Accordion** — `<Accordion>` with `<AccordionItem>` children. Expandable/collapsible content sections.
- **Carousel** — `<Carousel>` with `<CarouselSlide>` children. Swipeable/clickable content slides.
- **Click-to-reveal Modal** — `<RevealModal>` with Svelte 5 snippets for trigger and content. Click to open a modal overlay.

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

### Multimedia

- **Video** — `<Video>` component. Supports local files (`$assets/video.mp4`) and external URLs (YouTube, Vimeo embeds).
- **Audio** — `<Audio>` component. Supports local files and external URLs.
- **Images** — `<Image>` component with lazy loading, alt text, and optional caption. Preferred over raw `<img>` tags for consistent styling and lazy loading.

### Knowledge Checks / Quizzes

- **Multiple Choice** — `<MultipleChoice>` with options, correct answer, and feedback.
- **Matching** — `<Matching>` with pairs to connect.
- **Fill in the Blank** — `<FillInTheBlank>` with acceptable answers.

A quiz page is a regular page that includes `quiz` settings in its `pageConfig` and contains a `<Quiz>` component. The `<Quiz>` component wraps question components and manages the quiz flow — presenting one question at a time, tracking answers, scoring, and displaying results. One page = one quiz.

The runtime provides quiz configuration to the `<Quiz>` component via Svelte context — the runtime reads the page's quiz config from the manifest and sets it via `setContext('tessera-page', { quiz: ... })` before mounting the page. The `<Quiz>` component reads this context internally; no props are needed for configuration.

```svelte
<script context="module">
  export const pageConfig = {
    title: "Module 1 Assessment",
    quiz: {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
      showFeedback: true,
    }
  }
</script>

<Quiz>
  <MultipleChoice question="..." options={[...]} correct={0} />
  <FillInTheBlank question="..." answers={["..."]} />
  <Matching question="..." pairs={[...]} />
</Quiz>
```

### Quiz Flow

The `<Quiz>` component presents **one question at a time**:

1. Learner sees a single question with a **Next** button (and **Back** button after the first question)
2. A progress indicator shows current question number and total (e.g., "Question 3 of 10")
3. After the final question, a **Submit** button replaces Next
4. **Results screen** shows score and pass/fail status
5. If `showFeedback: true`, a **Review** button lets the learner step back through questions and see correct/incorrect status, the correct answer, and any feedback
6. **Retry** button appears if attempts remain. New score replaces the previous score.

**Mobile quiz experience:**
- Questions use full viewport width with generous touch targets (minimum 44×44px)
- Back/Next/Submit buttons are fixed to the bottom of the viewport for easy thumb access
- Progress indicator is compact (e.g., "3/10" instead of "Question 3 of 10")
- Results screen and review mode scroll vertically — no modals or overlays that fight mobile viewports
- Matching questions use a tap-to-select interaction model (tap first item, then tap its match) instead of drag-and-drop

### Feedback Model

- `showFeedback: true` — after submission, each question shows correct/incorrect status, reveals the correct answer, and displays feedback.
- `showFeedback: false` — after submission, only the overall score is shown. Individual questions show no feedback.
- **Per-question feedback** — each question component accepts `correctFeedback` and `incorrectFeedback` props.
- **Per-option feedback** — for multiple choice, each option can have feedback explaining why it's right/wrong.

### Scoring Model

- All graded quizzes contribute equally to the overall course score.
- **Overall course score** = sum of completed graded quiz scores divided by the total number of graded quizzes in the course. Unattempted graded quizzes are treated as 0 in the denominator (not excluded). This prevents premature "passed" status when a learner has only completed easier quizzes.
- The `scoring.passingScore` in `course.config.js` determines pass/fail for both individual quizzes (for gating) and the overall course (for LMS success status).
- Quiz scores are always tracked and reported to the LMS when graded quizzes exist, regardless of `completion.mode`. Completion mode only determines what triggers `completionStatus = "complete"`. Score and success status are independent.

**Example 1 — all quizzes completed:**
- Quiz A: score 90%, graded
- Quiz B: score 75%, graded
- Overall score = (90 + 75) / 2 = 82.5%
- If course `passingScore` is 70% → course passed

**Example 2 — unattempted quizzes count as 0 in denominator:**
- Quiz A: score 95%, graded
- Quiz B: not yet attempted, graded
- Quiz C: score 80%, graded
- Overall score = (95 + 0 + 80) / 3 = 58.3%
- If course `passingScore` is 70% → course has not yet passed (learner must complete Quiz B)

Completion is determined separately by `completion.mode` (quiz-based or percentage-based).

## Navigation

### Learner-Facing UI

- **Desktop:** persistent sidebar showing the course structure as a collapsible tree (sections → lessons → pages). The branding logo (if configured) and course title appear at the top of the sidebar. Current location highlighted. Next/previous buttons in the content area.
- **Mobile:** full-screen content with a hamburger menu toggle for the course structure. Logo and course title appear at the top of the slide-out panel. Next/previous buttons prominent.

### Keyboard Shortcuts

- **Left/Right arrow keys** navigate to the previous/next page when focus is not inside an interactive element (input, textarea, quiz question, accordion, carousel).
- These are convenience shortcuts, not a replacement for standard tab-based keyboard navigation.

### Navigation Modes

- **Free** (`navigation.mode: "free"`) — learner can jump to any page at any time, except pages blocked by a quiz gate.
- **Sequential** (`navigation.mode: "sequential"`) — learner must complete pages and lessons in order. Next page unlocks only after the current one is complete. Navigation sidebar shows locked items as disabled.

**Quiz gates:** A quiz page with `pageConfig.quiz.gatesProgress: true` blocks navigation to subsequent pages until the learner achieves a passing score. This applies in both `free` and `sequential` modes.

## Progress Tracking & Bookmarking

All progress is tracked internally by Tessera's runtime using Svelte stores.

### Page Completion

- **Informational pages** — complete when visited.
- **Quiz pages** — complete when answered (or passed, if gating is enabled).
- Interactive components (accordions, carousels, modals) do not gate page completion.

### Bookmarking

- The learner's current page (manifest index from the navigation store) is persisted as the bookmark on every page transition.
- On course resume, the runtime reads the bookmark, resolves it against the manifest, and navigates the learner to that page.
- The bookmark is persisted via the appropriate adapter (localStorage for web/preview, LMS API for SCORM/CMI5).

### Course Completion

Two configurable modes (set in `course.config.js` under `completion.mode`):

1. **Quiz-based** (`"quiz"`) — course complete when the overall average quiz score meets the `scoring.passingScore`.
2. **Percentage-based** (`"percentage"`) — course complete when the learner has visited `completion.percentageThreshold`% of pages.

Note: `completion.mode` controls only when `completionStatus` becomes `"complete"`. Quiz scores and `successStatus` (passed/failed) are tracked and reported independently whenever graded quizzes exist, regardless of completion mode.

## LMS Communication

### Supported Standards

- **Web** — static site output with no LMS dependencies. Upload to any web server. Progress and bookmarking use `localStorage` for session persistence. Default export format.
- **SCORM 1.2** — the most widely supported LMS standard. Works with virtually every LMS.
- **SCORM 2004** — newer SCORM version with sequencing support (Tessera handles sequencing internally, so this is used primarily for LMS compatibility).
- **CMI5** — modern xAPI-based standard. Best data model, but limited LMS support currently.

The export standard is configured in `course.config.js` under `export.standard`.

### Architecture

- The entire course is **one SCO** (SCORM) or **one Assignable Unit** (CMI5). The LMS launches the course as a single unit.
- Tessera's runtime includes a persistence layer that abstracts the differences between web (localStorage), SCORM 1.2, SCORM 2004, and CMI5 behind a unified internal API.
- All section/lesson/page navigation is internal to the course.

### What Gets Reported to the LMS

- **Completion status** — complete/incomplete
- **Success status** — passed/failed (based on `scoring.passingScore` and quiz results)
- **Score** — overall quiz score average (only reported if course has graded quizzes)
- **Bookmark/location** — last visited page for resume
- **Duration** — time spent in the course

### State Persistence & `suspend_data` Limits

SCORM standards impose size limits on `suspend_data`, which Tessera uses to persist learner state:

| Standard      | `suspend_data` Limit |
|---------------|----------------------|
| Web           | ~5MB (localStorage)  |
| SCORM 1.2     | 4,096 characters     |
| SCORM 2004    | 64,000 characters    |
| CMI5          | No limit             |

**Tessera's approach:**
- State is serialized as a compact JSON string: bookmark (page index), visited pages (as index array), and quiz scores (as index→score pairs). All values use manifest indices (integers) rather than path strings.
- **SCORM 1.2:** the 4KB limit supports approximately 200–300 pages with quiz scores. The build-time validator warns if the course structure could exceed this limit based on page count and number of graded quizzes.
- **SCORM 2004 / CMI5 / Web:** limits are large enough to be a non-concern for practical course sizes.
- If a persistence write fails at runtime, the error is handled by the error handling layer (see below).

### Error Handling

Persistence calls can fail (LMS API errors, localStorage quota exceeded). Tessera handles this gracefully:

- **Retry with backoff** — failed writes are retried up to 3 times with exponential backoff (LMS adapters only; localStorage failures are not retried).
- **Write queue** — state changes are queued and flushed in order. If a flush fails after retries, the queue is preserved and retried on the next successful call.
- **Graceful degradation** — if persistence is unavailable entirely, the course continues to function. The learner can still navigate and complete content; only persistence is affected.

### Export

`npm run export` produces a deployable package:

- **Web:** compiled app + assets in a `dist/` folder, ready to upload to any web server. No ZIP, no manifest.
- **SCORM 1.2:** `imsmanifest.xml`, compiled app, assets, packaged as ZIP
- **SCORM 2004:** `imsmanifest.xml` (2004 schema), compiled app, assets, packaged as ZIP
- **CMI5:** `cmi5.xml`, compiled app, assets, packaged as ZIP

## Theming & Styling

### Default Theme

Tessera ships with a polished, well-designed default theme. Colors, typography, spacing, and component styles are all production-ready out of the box.

### Branding & Custom Overrides

The `branding` fields in `course.config.js` (logo, primary color, font family) are applied via CSS custom properties that cascade through all components.

Users create CSS files in the `styles/` directory to override any default styles. They can create multiple files to organize overrides (e.g., `styles/typography.css`, `styles/quiz-styles.css`).

Users **never** edit framework files. All framework CSS ships inside the npm package (`node_modules/tessera/`). User overrides in `styles/` take precedence through CSS specificity.

## Assets

- **Local files** — stored in `assets/` folder, included in the export output.
- **External URLs** — YouTube/Vimeo embeds, CDN-hosted images, externally hosted video/audio. Referenced by URL in components, not bundled.
- **Path convention** — all asset references use the `$assets` alias: `$assets/image.png`. The Vite plugin resolves `$assets` to the project's `assets/` directory. This ensures correct resolution regardless of which page file references the asset.

## Accessibility

All default components meet **WCAG 2.1 AA** compliance:

- Semantic HTML throughout
- Proper ARIA labels and roles on all interactive components
- Full keyboard navigation (tab order, focus management, enter/space activation)
- Visible focus indicators
- Color contrast ratios meeting AA standards
- Screen reader support (live regions for quiz feedback, meaningful alt text patterns)

Accessibility is built into the default components. Authors get compliance for free when using Tessera's component library.

## Responsive Design

All components and layouts are fully responsive out of the box:

- Desktop, tablet, and mobile breakpoints
- Sidebar navigation collapses to hamburger on mobile
- Components reflow appropriately (carousels remain swipeable, accordions stack, modals adapt)
- Touch-friendly interaction targets on mobile

## Documentation

### Human Documentation

- README with getting started guide
- How to install and scaffold a project
- How to configure `course.config.js`
- How to structure content (sections, lessons, pages)
- Component reference with examples
- How to preview and export
- How to customize themes

### LLM Instructions File

`TESSERA.md` is generated into each scaffolded project, optimized for LLM coding agents. Contains:

- Project structure conventions
- Available components and their props/usage
- How to create pages, quizzes, and interactive content
- State management patterns
- Dos and don'ts

This file ensures consistent, correct output regardless of which LLM agent the user chooses.

## CLI Commands

```bash
npx create-tessera my-course    # scaffold a new project
npm run preview                 # preview with hot reload
npm run export                  # build + package for deployment
```

## Build-Time Validation

The Vite plugin validates the project during build and preview, reporting clear errors with file paths and fix suggestions:

- **`course.config.js`** — validates schema, required fields, value ranges (e.g., `passingScore` must be 0–100)
- **`_meta.js` files** — validates syntax and required `title` field
- **`pages` array** — validates that all listed filenames have corresponding `.svelte` files
- **Quiz config** — validates `maxAttempts` ≥ 0, `graded` is boolean, etc.
- **Orphan files** — warns about `.svelte` files outside the section/lesson hierarchy
- **Missing references** — warns about asset paths that don't resolve
- **Completion mode consistency** — errors if `completion.mode` is `"quiz"` but no graded quizzes exist
- **Empty course** — errors if `pages/` is empty or contains no valid section/lesson/page structure
- **SCORM 1.2 `suspend_data` risk** — warns if page count and quiz count could exceed the 4KB limit when exporting as SCORM 1.2

All validation errors block the build with actionable messages. Warnings are displayed but don't block.

## Performance

- **Code splitting** — each page is a dynamically imported chunk. Only the app shell and current page are loaded initially.
- **Lazy loading** — `<Image>` and `<Video>` components lazy-load by default (native `loading="lazy"` and Intersection Observer).
- **Target** — app shell + first page under 500KB. Subsequent pages load on demand.
- **No runtime framework overhead** — Svelte compiles to vanilla JS.

## Page Authoring Constraints

Page `.svelte` files support:

- ✅ `<script context="module">` for `pageConfig` export (static object literal only)
- ✅ `<script>` for component-level state, event handlers, reactive declarations
- ✅ Importing Tessera components (`import { Quiz, Accordion } from 'tessera'`)
- ✅ Importing third-party libraries — must be installed as project dependencies so Vite bundles them into the build
- ✅ Standard HTML and Svelte template syntax
- ❌ Fetching external data at runtime — LMS environments have unpredictable CORS policies and network restrictions
- ❌ Directly importing or mutating Tessera runtime stores — use Tessera components, which manage state internally

Third-party libraries are supported but the author is responsible for ensuring they work in LMS environments (no server-side dependencies, no assumptions about browser APIs that may be blocked in LMS iframes).

## Versioning

- Tessera follows **semver** (`major.minor.patch`).
- Scaffolded `package.json` pins to the major version: `"tessera": "^1.0.0"`.
- Breaking changes (component API changes, config schema changes, store API changes) only occur in major version bumps.
- `CHANGELOG.md` is published with the npm package documenting all changes per release.
- Within a major version, new components and config options are additive only — existing projects continue to work without modification.

## Future Scope (Not in Initial Build)

- **Drag and Drop quiz type** — `<DragAndDrop>` component (complex touch/accessibility concerns)
- **Variable support** — author-defined variables for state, conditional content, and custom gating
- **Localization / multi-language** — course content in multiple languages
- **Branching / scenario content** — choose-your-path interactions
- **Simulations** — click-through software demos
- **Asset optimization** — image compression/resizing during build
- **Variable-based navigation gating** — custom unlock conditions using author variables
- **Page transitions** — slide/fade transitions between pages
- **Custom navigation** — API for authors to build their own navigation UI
- **Weighted quiz scoring** — configurable weights per quiz for overall score calculation
- **Content reuse** — shared components, question banks, partial templates
- **Print/PDF export** — printable course content for compliance documentation
