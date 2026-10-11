# Tessera

[![CI](https://img.shields.io/github/actions/workflow/status/redmodd/tessera/ci.yml?branch=main&label=CI)](https://github.com/redmodd/tessera/actions/workflows/ci.yml)
[![tessera-learn on npm](https://img.shields.io/npm/v/tessera-learn?label=tessera-learn)](https://www.npmjs.com/package/tessera-learn)
[![create-tessera on npm](https://img.shields.io/npm/v/create-tessera?label=create-tessera)](https://www.npmjs.com/package/create-tessera)
[![Node.js >=24](https://img.shields.io/node/v/tessera-learn?label=node)](https://nodejs.org)
[![License: MIT](https://img.shields.io/github/license/redmodd/tessera)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A framework for building interactive eLearning courses that run in any learning management system (LMS) that supports SCORM 1.2, SCORM 2004, cmi5, xAPI, or static web. **It's designed for AI-assisted authoring.**

📖 **[tesseralearn.dev](https://tesseralearn.dev)**: docs, guides, and demo courses.

Open your workspace in an AI coding assistant like [Claude Code](https://claude.com/code), [Codex](https://openai.com/codex), or any tool that reads `AGENTS.md`, and describe what you want in plain English. The assistant uses `AGENTS.md` (scaffolded at the root of every workspace, pointing at the guide that ships inside the framework) to write properly-structured pages, build whatever components you need against the hooks API, wire up quizzes, and configure your LMS export. Built-in components (`Callout`, `Image`, `MultipleChoice`, etc.) are included as reference examples; the assistant uses them where they fit and writes new ones where they don't.

**There's no required look, layout, or component set.** Tessera locks the LMS data contract (tracking, completion, scoring, navigation, saved state) and gets out of the way of the design. Anything that can be built with HTML, CSS, and Svelte can be built with Tessera.

When you're done, one command packages a course as SCORM 1.2, SCORM 2004, cmi5 (an xAPI profile for LMSs), xAPI 1.0.3 ("Tin Can"), or a static web bundle. Completion, scores, and saved progress report back to the LMS automatically. The same source builds for every standard, so you don't maintain five versions.

**One workspace, many courses.** A Tessera _workspace_ is a single package (one `package.json`, one `node_modules`) that holds as many courses as you like under `courses/<name>/`, plus a `shared/` design system any course can import as `$shared`. Each course still exports independently to its own LMS package. New workspaces seed one course to start; `pnpm tessera new <name>` adds more.

_Under the hood:_ Tessera is a runtime built on Svelte and Vite. Pages are `.svelte` files. You can edit them directly in code; the AI assistance is there to do the heavy lifting.

## Prerequisites

Tessera needs **Node.js 24 or later** and **pnpm**. If you don't have them, [Getting started](https://tesseralearn.dev/docs/getting-started/) walks through installing both on macOS, Windows, and Linux.

**Editor (optional):** While Tessera is designed for AI-assisted authoring, you can see and edit course files in any text editor, such as [Visual Studio Code](https://code.visualstudio.com/) which is a good free choice. Install the [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) extension for syntax highlighting on `.svelte` files.

## Quick start

```bash
pnpm create tessera@latest my-courses
cd my-courses
pnpm install
pnpm dev starter-course      # live preview at http://localhost:5173
```

This scaffolds a workspace with one seed course (`starter-course`). Open the printed URL (e.g. `http://localhost:5173`) in your browser. The page hot-reloads as you edit course files. Stop the preview with `Ctrl+C`.

## Commands

Every command works on one course. Name it, or `cd` into the course folder and leave the name off. A bare `pnpm dev` from the workspace root lists the available courses rather than guessing.

```bash
pnpm dev <course>       # live preview, hot-reloads as you edit
pnpm validate <course>  # structural errors only, no server, no build
pnpm a11y <course>      # accessibility audit on its own (axe-core, headless browser)
pnpm check <course>     # validate, then the accessibility audit; run before export
pnpm export <course>    # build + package for the course's configured standard

pnpm export <course> --standard scorm2004    # override export.standard for this build
pnpm validate <course> --standard scorm2004  # check against a standard before switching to it
pnpm check <course> --threshold moderate     # stricter accessibility gate (default: serious)

pnpm tessera new intro                  # add another course at courses/intro/
pnpm tessera duplicate intro intro-v2   # copy an existing course
```

`pnpm export` puts the finished package in the course folder: `courses/<course>/<title>-<version>.zip` for SCORM, cmi5, and xAPI, replacing the previous zip for that course. The `web` standard skips zipping and leaves the built site in `courses/<course>/dist/`.

The code below is a basic example of a page. If you don't know what the code means, that's okay, your assistant does.

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

Updating is a plain dependency bump: from the workspace root, run `pnpm add tessera-learn@latest`. The whole workspace shares the one dependency, so every course moves together. Some updates change how courses are written, and some reset learners' saved progress, so read the [changelog](./packages/tessera-learn/CHANGELOG.md) first, or ask your assistant to apply it for you. See [`packages/create-tessera/README.md`](./packages/create-tessera/README.md#updating-an-existing-workspace) for details.

## Authoring with AI

Once your workspace is running, ask your assistant for what you want:

> _"Add a new section called 'Workplace Safety' with three lessons: an intro page, a video page using `safety-overview.mp4` from assets, and a quiz with five multiple-choice questions about hazard recognition."_

`AGENTS.md` (at the root of your workspace) points your assistant at the authoring guide, which teaches it the conventions: how courses, pages, sections, and lessons are organised; how `pageConfig` and `course.config.js` work; which built-in components exist; how to share a design system across courses via `$shared`; and how to author new components against the hooks API (`useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useCourse`, `useXAPI`). Anything the built-ins do, a custom component can do, with the same scoring, LMS reporting, and saved state.

You review the output, ask for changes, and iterate. The live preview hot-reloads as your assistant writes, so you see each change immediately.

## Documentation

- **[tesseralearn.dev/docs](https://tesseralearn.dev/docs/)**: getting started (install steps and troubleshooting), workspaces, GitHub, authoring with AI, quizzes, how SCORM/xAPI work, validation & accessibility, exporting.
- **[Authoring guide](./packages/tessera-learn/AGENTS.md)**: the technical reference. `AGENTS.md` covers components, quizzes and the `course.config.js` shape, and routes hooks, layouts, scoring, custom xAPI and export to the files in [`docs/`](./packages/tessera-learn/docs/). Ships inside `tessera-learn`; every scaffolded workspace points its assistant at it.
- **[tessera-demo-courses](https://github.com/redmodd/tessera-demo-courses)**: a complete example workspace.

## Contributing

Want to contribute to Tessera itself (not author a course)? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repo layout, build commands, test setup, and release process.

## License

MIT © Derek Redmond
