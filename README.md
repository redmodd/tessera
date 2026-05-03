# Tessera

Tessera is an LMS tracking runtime for interactive learning content. SCORM 1.2, SCORM 2004 4th Edition, cmi5, and Web delivery — one codebase, one adapter layer, your choice of components. Ships with a starter kit of Svelte components you can use, compose, or replace entirely.

Write course content as plain `.svelte` files, organize it into sections and lessons, and drop in built-in components for callouts, carousels, video, audio, modals, and quizzes — or skip the built-ins and build your own widgets with four hooks (`useQuestion`, `useNavigation`, `useProgress`, `usePersistence`). Export as a static website or as a SCORM 1.2, SCORM 2004, or cmi5 package that plugs into any LMS and reports completion, scores, and bookmarking back automatically.

## Quick start

```bash
npm create @redmondd/tessera@latest my-course
cd my-course
npm install
npm run preview   # local dev server
npm run export    # build + package for the configured standard
```

Prefer hooks-only? `npm create @redmondd/tessera@latest -- --template=bare my-course` scaffolds a minimal project with no built-in components.

## What a page looks like

```svelte
<script module>
  export const pageConfig = { title: "Welcome" };
</script>

<script>
  import { Callout, Image } from '@redmondd/tessera';
</script>

<h1>Welcome to the course</h1>
<p>This is a plain Svelte file. Write whatever HTML you like.</p>

<Callout type="tip">
  <p>Drop in components for richer content.</p>
</Callout>

<Image src="$assets/diagram.png" alt="System diagram" caption="Figure 1" />
```

## Quizzes

```svelte
<script module>
  export const pageConfig = {
    title: "Module 1 Quiz",
    quiz: {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
      feedbackMode: "immediate",
      retryMode: "incorrect-only",
    }
  };
</script>

<script>
  import { Quiz, MultipleChoice, Matching, Sorting } from '@redmondd/tessera';
</script>

<Quiz>
  <MultipleChoice
    question="Which planet is closest to the Sun?"
    options={["Venus", "Mercury", "Earth", "Mars"]}
    correct={1}
  />
</Quiz>
```

Question components (`MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`) also work standalone, outside a `<Quiz>`, for inline practice that isn't tracked or scored.

## Features

- **One adapter layer** — SCORM 1.2, SCORM 2004 4th Edition, cmi5, and static Web. The runtime translates every learner action into the right protocol; your code never touches `cmi.*` strings or xAPI statements.
- **Hooks API** — `useQuestion`, `useNavigation`, `useProgress`, `usePersistence`. The same surface the built-in components are written against. Build any widget the framework can.
- **Authoring in Svelte** — no custom DSL, no JSON schemas. If you can write a component, you can write a course.
- **Built-in components** — `Callout`, `Image`, `Accordion`, `Carousel`, `RevealModal`, `Video`, `Audio`, plus a quiz system with four question types. Use them, compose with them, or replace them.
- **Custom layouts** — drop a `layout.svelte` at the project root and own the page shell entirely.
- **Custom access rules** — beyond the `free` / `sequential` presets, supply a `canAccess` predicate for prerequisites, gating, or anything you need.
- **Theming via CSS custom properties** — override `--tessera-primary`, fonts, spacing, and layout widths without touching framework code.
- **Automatic assets pipeline** — drop files into `assets/` and reference them with `$assets/` in any component prop.
- **Persistent state** — progress, bookmarks, and quiz scores survive closing the tab (localStorage for web, `suspend_data` for SCORM, xAPI State API for cmi5).
- **Custom xAPI statements** — `useXAPI()` returns a publisher for emitting your own verbs to a Learning Record Store. Single-LRS or fan-out, Basic auth (with token-resolver functions for OAuth-fronted LRSes), retry on 5xx, and shared-id idempotent dedupe across destinations. Works under any export mode; under cmi5, opt-in to share the LMS launch LRS so your statements interleave with the lifecycle stream.

## Documentation

The full authoring guide lives in [`AGENTS.md`](./AGENTS.md). Every scaffolded project ships a copy at its own root so authors — and any LLM agent working in the project (Claude Code, Cursor, Aider, codex, etc.) — have the reference locally.

## Repository layout

```
packages/
  tessera/                       # Framework runtime + Vite plugin
  create-tessera/                # Scaffolder for new courses
tests/
  e2e/                           # Playwright specs
  fixtures/
    free/                        # free-mode + mobile + components
    sequential/                  # sequential-mode
    custom-quiz/                 # drop-in quiz.svelte
    custom-layout/               # layout.svelte override
AGENTS.md                        # Course authoring guide (for humans + LLM agents)
```

`tests/fixtures/` is local-only (gitignored). Each subdirectory corresponds
to a Playwright project in `playwright.config.ts` and must be scaffolded
before running `pnpm test:e2e` — use `npm create @redmondd/tessera@latest`
or copy from a previous checkout.

## Development

```bash
pnpm install
pnpm build             # build both packages
pnpm test              # run unit tests
pnpm test:e2e          # run Playwright suites
```

## License

MIT © Derek Redmond
