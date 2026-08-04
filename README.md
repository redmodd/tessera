# Tessera

[![CI](https://img.shields.io/github/actions/workflow/status/redmodd/tessera/ci.yml?branch=main&label=CI)](https://github.com/redmodd/tessera/actions/workflows/ci.yml)
[![tessera-learn on npm](https://img.shields.io/npm/v/tessera-learn?label=tessera-learn)](https://www.npmjs.com/package/tessera-learn)
[![create-tessera on npm](https://img.shields.io/npm/v/create-tessera?label=create-tessera)](https://www.npmjs.com/package/create-tessera)
[![Node.js >=24](https://img.shields.io/node/v/tessera-learn?label=node)](https://nodejs.org)
[![License: MIT](https://img.shields.io/github/license/redmodd/tessera)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Tessera is a toolkit for building interactive online courses that play in any learning management system (LMS). **It's designed for AI-assisted authoring.**

📖 **[tesseralearn.dev](https://tesseralearn.dev)** — docs, guides, and demo courses.

Open your course in an AI coding assistant like [Claude Code](https://claude.com/code), [Codex](https://openai.com/codex), or any tool that reads `AGENTS.md`, and describe what you want in plain English. The assistant uses `AGENTS.md` (scaffolded at the root of every project, pointing at the guide that ships inside the framework) to write properly-structured pages, build whatever components you need against the hooks API, wire up quizzes, and configure your LMS export. Built-in components (`Callout`, `Image`, `MultipleChoice`, etc.) are included as reference examples; the assistant uses them where they fit and writes new ones where they don't.

**There's no required look, layout, or component set.** Tessera locks the LMS data contract (tracking, completion, scoring, navigation, persistence) and gets out of the way of the design. Anything that can be built with HTML, CSS, and Svelte, can be built with Tessera.

When you're done, one command packages a course as SCORM 1.2, SCORM 2004, cmi5 (an xAPI profile for LMSs), xAPI 1.0.3 ("Tin Can"), or a static web bundle. Completion, scores, and bookmarking report back to the LMS automatically. The same source builds for every standard, so you don't maintain five versions.

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

Then install **pnpm**, the package manager the commands below use:

```bash
npm install -g pnpm
```

**Editor (optional):** While Tessera is designed for AI-assisted authoring, you can see and edit course files in any text editor, such as [Visual Studio Code](https://code.visualstudio.com/) which is a good free choice. Install the [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) extension for syntax highlighting on `.svelte` files.

## Quick start

```bash
pnpm create tessera@latest my-courses
cd my-courses
pnpm install
pnpm dev starter-course      # local dev server at http://localhost:5173
```

This scaffolds a workspace with one seed course (`starter-course`). Open the printed URL (e.g. `http://localhost:5173`) in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`.

## Commands

Every command names the course it works on. The root scripts forward to whichever course you name; a bare `pnpm dev` lists the available courses rather than guessing.

```bash
pnpm dev <course>       # local dev server, hot-reloads as you edit
pnpm validate <course>  # structural errors only — no server, no build
pnpm a11y <course>      # accessibility audit on its own (axe-core, headless browser)
pnpm check <course>     # validate, then the accessibility audit — run before export
pnpm export <course>    # build + package for the course's configured standard
pnpm export <course> --standard scorm2004  # override export.standard for this build

pnpm tessera new intro                  # add another course at courses/intro/
pnpm tessera duplicate intro intro-v2   # copy an existing course
```

Every scaffolded workspace ships with `AGENTS.md` at its root, pointing your agent at the full authoring guide inside the installed framework (creating pages, components, hooks, quizzes, custom layouts, custom xAPI, and sharing a design system across courses via `$shared`). The code below is a basic example of a page. If you don't know what the code means, that's okay, your agent does.

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

`AGENTS.md` (at the root of your workspace) points the agent at the authoring guide, which teaches it the conventions: how courses, pages, sections, and lessons are organized; how `pageConfig` and `course.config.js` work; which built-in components exist; how to share a design system across courses via `$shared`; and how to author new components against the hooks API (`useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useXAPI`). Anything the built-ins do, an agent-authored component can do, with the same scoring, LMS reporting, and persistence.

You review the output, ask for changes, and iterate. The dev server hot-reloads as the agent writes, so you see each change immediately.

## Troubleshooting

**`command not found: pnpm`**: pnpm isn't installed. Install it via `npm install -g pnpm` or `corepack enable pnpm` (Node 24+ includes corepack). Then close and reopen your terminal.

**`engine "node" is incompatible` or similar version errors**: your Node version is older than 24. Run `node --version` to check, then install the current version from [nodejs.org/en/download](https://nodejs.org/en/download).

**`Port 5173 is already in use`**: another dev server is running. Either close it, or let Tessera pick the next port (it'll print the new URL; open that one).

**`pnpm install` fails with network errors**: check your internet connection and retry. If you're behind a corporate proxy or firewall, pnpm needs proxy configuration (search "pnpm proxy settings" or ask your IT team).

**Permission errors during `pnpm install`**: don't use `sudo` — it leaves root-owned files that break later installs. Fix ownership of the affected directory instead (`sudo chown -R $(whoami) ~/.local/share/pnpm ~/path/to/my-courses` on macOS/Linux).

**The browser shows a blank page after `pnpm dev <course>`**: open your browser's developer console (`F12` → Console tab) for the actual error. Common causes: a typo in a `.svelte` file, an unclosed tag, or a missing asset reference.

## Documentation

- **[tesseralearn.dev/docs](https://tesseralearn.dev/docs/)** — getting started, workspaces, quizzes, validation & accessibility, exporting, how SCORM/xAPI work.
- **[Authoring guide](./packages/tessera-learn/AGENTS.md)** — the full technical reference (components, hooks, quizzes, layouts, custom xAPI, the `course.config.js` shape). Ships inside `tessera-learn`; every scaffolded workspace points its agent at it.
- **[tessera-demo-courses](https://github.com/redmodd/tessera-demo-courses)** — a complete example workspace.

## Contributing

Want to contribute to Tessera itself (not author a course)? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repo layout, build commands, test setup, and release process.

## License

MIT © Derek Redmond
