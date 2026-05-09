# Tessera

Tessera is an LMS tracking runtime for interactive learning content. SCORM 1.2, SCORM 2004 4th Edition, cmi5, and static Web — one codebase, one adapter layer, your choice of components. Ships with a starter kit of Svelte components you can use, compose, or replace entirely.

Write course content as plain `.svelte` files, organize it into sections and lessons, and drop in built-in components for callouts, carousels, video, audio, modals, and quizzes — or skip the built-ins and build your own widgets with the hooks API. Export as a static website or as a SCORM 1.2, SCORM 2004, or cmi5 package that plugs into any LMS and reports completion, scores, and bookmarking back automatically.

## Prerequisites

Tessera requires **Node.js 24 or later** (which includes `npm`). If you already have it, jump to [Quick start](#quick-start). Otherwise:

- **macOS:** Download the macOS Installer (`.pkg`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.
- **Windows:** Download the Windows Installer (`.msi`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.

Open a **new** Terminal (macOS) or PowerShell / Command Prompt (Windows) window after installing and confirm:

```bash
node --version    # should print v24.x.x or higher
```

## Quick start

```bash
npm create tessera@latest my-course
cd my-course
npm install
npm run preview   # local dev server at http://localhost:5173
npm run export    # build + package for the configured standard
```

Open the printed URL (`http://localhost:5173`) in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`.

Prefer hooks-only? `npm create tessera@latest -- --template=bare my-course` scaffolds a minimal project with no built-in components.

Every scaffolded project ships with `AGENTS.md` at its root — open it for the full authoring guide (creating pages, components, hooks, quizzes, custom layouts, custom xAPI).

```svelte
<script module>
  export const pageConfig = { title: "Welcome" };
</script>

<script>
  import { Callout } from 'tessera-learn';
</script>

<h1>Welcome to the course</h1>
<Callout type="tip"><p>Drop in components for richer content.</p></Callout>
```

## Documentation

The authoring guide — components, hooks, quizzes, layouts, custom xAPI, the full `course.config.js` shape — lives in [`AGENTS.md`](./AGENTS.md). Every scaffolded project ships a copy at its own root so authors and any LLM agent working in the project (Claude Code, Cursor, Aider, codex, etc.) have the reference locally.

## Repository layout

```
packages/
  tessera-learn/                 # Framework runtime + Vite plugin
  create-tessera/                # Scaffolder for new courses
tests/
  e2e/                           # Playwright specs
  fixtures/                      # Course projects used by e2e (committed)
test-projects/                   # Standalone fixtures for specific test scenarios
AGENTS.md                        # Course authoring guide (canonical source)
scripts/sync-agents-md.mjs       # Copies AGENTS.md into both packages on prebuild
```

## Development

```bash
pnpm install
pnpm build             # syncs AGENTS.md, then builds both packages
pnpm test              # checks AGENTS.md is in sync, then runs unit tests
pnpm test:e2e          # runs Playwright suites
```

Edit `AGENTS.md` at the repo root only. The sync step in `pnpm build` copies it into `packages/tessera-learn/` and `packages/create-tessera/` so it ships with the published packages. `pnpm sync:agents:check` (run by `pnpm test`) fails CI if a copy has drifted.

## License

MIT © Derek Redmond
