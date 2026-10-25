<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/tessera-dark.svg">
    <img src=".github/assets/tessera-light.svg" alt="Tessera" height="72">
  </picture>
</h1>

<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/redmodd/tessera/ci.yml?branch=main&label=CI)](https://github.com/redmodd/tessera/actions/workflows/ci.yml)
[![tessera-learn on npm](https://img.shields.io/npm/v/tessera-learn?label=tessera-learn)](https://www.npmjs.com/package/tessera-learn)
[![create-tessera on npm](https://img.shields.io/npm/v/create-tessera?label=create-tessera)](https://www.npmjs.com/package/create-tessera)
[![Node.js >=24](https://img.shields.io/node/v/tessera-learn?label=node)](https://nodejs.org)
[![License: MIT](https://img.shields.io/github/license/redmodd/tessera)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

A JavaScript framework for building interactive eLearning courses that run in any learning management system (LMS) that supports SCORM 1.2, SCORM 2004, cmi5, xAPI, or static web. **It's designed for AI-assisted authoring.**

📖 **[tesseralearn.dev](https://tesseralearn.dev)**: docs, guides, and demo courses.

Open your workspace in an AI coding assistant like [Claude Code](https://claude.com/code), [Codex](https://openai.com/codex), or any tool that reads `AGENTS.md`, and describe what you want in plain English. The assistant writes the pages, builds whatever components you need, wires up quizzes, and configures your LMS export.

**There's no required look, layout, or component set.** Tessera locks the LMS data contract (tracking, completion, scoring, navigation, saved state) and gets out of the way of the design. Anything that can be built with HTML, CSS, and Svelte can be built with Tessera.

When you're done, one command packages the course for your LMS. Completion, scores, and saved progress report back automatically. The same source builds for every standard, so you don't maintain five versions.

## Quick start

You need **Node.js 24 or later** and **pnpm**. [Getting started](https://tesseralearn.dev/docs/getting-started/) walks through installing both on macOS, Windows, and Linux.

```bash
pnpm create tessera@latest my-courses
cd my-courses
pnpm install
pnpm dev starter-course      # live preview at http://localhost:5173
```

This scaffolds a [workspace](https://tesseralearn.dev/docs/workspace/) with one seed course (`starter-course`). A workspace holds as many courses as you like under `courses/<name>/`, plus a `shared/` design system any course can import as `$shared`. Each course exports to its own LMS package.

## Commands

Every command works on one course, so name it. From inside a course folder, run `npx tessera <command>` with no name instead: `pnpm` scripts always run from the workspace root. A bare `pnpm dev` from the workspace root lists the available courses rather than guessing.

```bash
pnpm dev <course>       # live preview, hot-reloads as you edit
pnpm validate <course>  # static checks only, no server, no build
pnpm a11y <course>      # accessibility audit on its own (axe-core, headless browser)
pnpm check <course>     # validate, then the accessibility audit; run before export
pnpm export <course>    # build + package for the course's configured standard

pnpm export <course> --standard scorm2004    # override export.standard for this build
pnpm validate <course> --standard scorm2004  # check against a standard before switching to it
pnpm check <course> --threshold moderate     # stricter accessibility gate (default: serious)

pnpm tessera new intro                  # add another course at courses/intro/
pnpm tessera duplicate intro intro-v2   # copy an existing course
```

`pnpm export` puts the finished package in the course folder. [Exporting](https://tesseralearn.dev/docs/exporting/) covers the output, testing, and uploading; [Validation & accessibility](https://tesseralearn.dev/docs/validation-accessibility/) covers the checks.

## Authoring with AI

Once your workspace is running, ask your assistant for what you want:

> _"Add a new section called 'Workplace Safety' with three lessons: an intro page, a video page using `safety-overview.mp4` from assets, and a quiz with five multiple-choice questions about hazard recognition."_

`AGENTS.md` (at the root of your workspace) points your assistant at the authoring guide that ships inside the framework. The guide teaches it how courses are organised, which built-in components exist, and how to write new ones with the same scoring, LMS reporting, and saved state. You review the output in the live preview, ask for changes, and iterate. [Authoring with AI](https://tesseralearn.dev/docs/authoring-with-ai/) has more on how to ask.

Tessera is a runtime built on Svelte and Vite, and pages are `.svelte` files, so you can also edit them by hand in any text editor. In [Visual Studio Code](https://code.visualstudio.com/), the [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) extension adds syntax highlighting. [Under the hood](https://tesseralearn.dev/docs/under-the-hood/) covers the hooks API, custom layouts, and build options.

## Updating an existing workspace

Ask your assistant to update the framework. The authoring guide has it check the [changelog](./packages/tessera-learn/CHANGELOG.md) and warn you about anything that resets learners' saved progress, and ask whether to go on, before it edits a course. Every course moves together. [`packages/create-tessera/README.md`](./packages/create-tessera/README.md#updating-an-existing-workspace) covers updating by hand.

## Documentation

- **[tesseralearn.dev/docs](https://tesseralearn.dev/docs/)**: the guides, from installing to exporting.
- **[Authoring guide](./packages/tessera-learn/AGENTS.md)**: the technical reference your assistant reads, with further files in [`docs/`](./packages/tessera-learn/docs/). Ships inside `tessera-learn`.
- **[tessera-demo-courses](https://github.com/redmodd/tessera-demo-courses)**: a complete example workspace.

## Contributing

Want to contribute to Tessera itself (not author a course)? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repo layout, build commands, test setup, and release process.

## License

MIT © Derek Redmond
