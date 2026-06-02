# Tessera

[![CI](https://img.shields.io/github/actions/workflow/status/redmodd/tessera/ci.yml?branch=main&label=CI)](https://github.com/redmodd/tessera/actions/workflows/ci.yml)
[![tessera-learn on npm](https://img.shields.io/npm/v/tessera-learn?label=tessera-learn)](https://www.npmjs.com/package/tessera-learn)
[![create-tessera on npm](https://img.shields.io/npm/v/create-tessera?label=create-tessera)](https://www.npmjs.com/package/create-tessera)
[![Node.js >=24](https://img.shields.io/node/v/tessera-learn?label=node)](https://nodejs.org)
[![License: MIT](https://img.shields.io/github/license/redmodd/tessera)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Tessera is a toolkit for building interactive online courses that play in any learning management system (LMS). **It's designed for AI-assisted authoring.**

Open your course in an AI coding assistant like [Claude Code](https://claude.com/code), [Codex](https://openai.com/codex), or any tool that reads `AGENTS.md`, and describe what you want in plain English. The assistant uses `AGENTS.md` (shipped at the root of every scaffolded project) to write properly-structured pages, build whatever components you need against the hooks API, wire up quizzes, and configure your LMS export. Built-in components (`Callout`, `Image`, `MultipleChoice`, etc.) are included as reference examples; the assistant uses them where they fit and writes new ones where they don't.

**There's no required look, layout, or component set.** Tessera locks the LMS data contract (tracking, completion, scoring, navigation, persistence) and gets out of the way of the design. Anything that can be built with HTML, CSS, and Svelte, can be built with Tessera.

When you're done, one command packages a course as SCORM 1.2, SCORM 2004, cmi5 (an xAPI profile for LMSs), or a static web bundle. Completion, scores, and bookmarking report back to the LMS automatically. The same source builds for every standard, so you don't maintain four versions.

**One project, many courses.** A Tessera project is a _workspace_: a single package (one `package.json`, one `node_modules`) that holds as many courses as you like under `courses/<name>/`, plus a `shared/` design system any course can import as `$shared`. Each course still exports independently to its own LMS package. New workspaces seed one course to start; `pnpm tessera new <name>` adds more.

_Under the hood:_ Tessera is a runtime built on Svelte and Vite. Pages are `.svelte` files. You can edit them directly in code; the AI assistance is there to do the heavy lifting.

## Prerequisites

Tessera requires **Node.js 24 or later**. If you already have it, jump to [Quick start](#quick-start). Otherwise:

- **macOS:** Download the macOS Installer (`.pkg`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.
- **Windows:** Download the Windows Installer (`.msi`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.

Open a **new** Terminal (macOS) or PowerShell / Command Prompt (Windows) window after installing and confirm:

```bash
node --version    # should print v24.x.x or higher
```

**Editor (optional):** While Tessera is designed for AI-assisted authoring, you can see and edit course files in any text editor, such as [Visual Studio Code](https://code.visualstudio.com/) which is a good free choice. Install the [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) extension for syntax highlighting on `.svelte` files.

## Quick start

```bash
pnpm create tessera@latest my-courses
cd my-courses
pnpm install
pnpm dev               # local dev server at http://localhost:5173 (runs the seed course)
pnpm export            # build + package the seed course for the configured standard
pnpm validate          # check the seed course for structural errors, no server or build
pnpm tessera new intro # add another course at courses/intro/
```

(If you prefer `npm`, `yarn`, or `bun`, substitute those commands.)

This scaffolds a workspace with one seed course (`starter-course`). The root scripts above target that course; to drive another, name it (`pnpm tessera dev intro`) or `cd courses/intro` and run `pnpm exec tessera dev`. Open the printed URL (e.g. `http://localhost:5173`) in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`.

Every scaffolded workspace ships with `AGENTS.md` at its root. Your agent will read this file for the full authoring guide (creating pages, components, hooks, quizzes, custom layouts, custom xAPI, and sharing a design system across courses via `$shared`). The code below is a basic example of a page. If you don't know what the code means, that's okay, your agent does.

```svelte
<script module>
  export const pageConfig = { title: 'Welcome' };
</script>

<script>
  import { Callout } from 'tessera-learn';
</script>

<h1>Welcome to the course</h1>
<Callout type="tip"><p>Drop in components for richer content.</p></Callout>
```

## Updating an existing workspace

Updating is a plain dependency bump — from the workspace root, `pnpm add tessera-learn@latest`. The whole workspace shares the one dependency, so every course moves together, and the framework owns the build and the reserved scripts, so there's nothing else to reconcile. See [`packages/create-tessera/README.md`](./packages/create-tessera/README.md#updating-an-existing-workspace) for details.

## Authoring with AI

Once your project is running, ask the agent for what you want:

> _"Add a new section called 'Workplace Safety' with three lessons: an intro page, a video page using `safety-overview.mp4` from assets, and a quiz with five multiple-choice questions about hazard recognition."_

`AGENTS.md` (at the root of your workspace) teaches the agent the conventions: how courses, pages, sections, and lessons are organized; how `pageConfig` and `course.config.js` work; which built-in components exist; how to share a design system across courses via `$shared`; and how to author new components against the hooks API (`useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `usePersistence`). Anything the built-ins do, an agent-authored component can do, with the same scoring, LMS reporting, and persistence.

You review the output, ask for changes, and iterate. The dev server hot-reloads as the agent writes, so you see each change immediately.

## Troubleshooting

**`command not found: pnpm`**: pnpm isn't installed. Install it via `npm install -g pnpm` or `corepack enable pnpm` (Node 24+ includes corepack). Then close and reopen your terminal.

**`engine "node" is incompatible` or similar version errors**: your Node version is older than 24. Run `node --version` to check, then install the current version from [nodejs.org/en/download](https://nodejs.org/en/download).

**`Port 5173 is already in use`**: another dev server is running. Either close it, or let Tessera pick the next port (it'll print the new URL; open that one).

**`pnpm install` fails with network errors**: check your internet connection and retry. If you're behind a corporate proxy or firewall, pnpm needs proxy configuration (search "pnpm proxy settings" or ask your IT team).

**Permission errors during `pnpm install`**: don't use `sudo`. See [pnpm's guide to resolving permission errors](https://pnpm.io/cli/install#--no-optional).

**The browser shows a blank page after `pnpm dev`**: open your browser's developer console (`F12` → Console tab) for the actual error. Common causes: a typo in a `.svelte` file, an unclosed tag, or a missing asset reference.

## Documentation

The authoring guide (workspaces, components, hooks, quizzes, layouts, custom xAPI, the full `course.config.js` shape) lives in [`AGENTS.md`](./AGENTS.md), shipped at the root of every scaffolded workspace for both human authors and AI agents.

## Contributing

Want to contribute to Tessera itself (not author a course)? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repo layout, build commands, test setup, and release process.

## License

MIT © Derek Redmond
