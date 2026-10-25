# create-tessera

Scaffold a new [Tessera](https://tesseralearn.dev) workspace: a single project that holds many courses.

Tessera is a JavaScript framework for building interactive eLearning courses that run in any learning management system (LMS) that supports SCORM 1.2, SCORM 2004, cmi5, xAPI, or static web. It's designed for AI-assisted authoring: open the scaffolded workspace in Claude Code, Codex, or any tool that reads `AGENTS.md`, and describe the course you want in plain English.

## Usage

Requires **Node.js 24 or later** and **pnpm** (`npm install -g pnpm`). If you have neither, [Getting started](https://tesseralearn.dev/docs/getting-started/) walks through installing both on macOS, Windows, and Linux.

```bash
pnpm create tessera@latest my-courses
cd my-courses
pnpm install
pnpm dev starter-course      # live preview at http://localhost:5173
```

`npm create tessera@latest my-courses` and `yarn create tessera my-courses` scaffold the same workspace. `--help` prints usage.

The workspace's own `README.md` lists the rest of the commands (`validate`, `check`, `export`, `tessera new`, …), and [Getting started](https://tesseralearn.dev/docs/getting-started/) explains them.

## What you get

- `package.json`: the one package, which owns `tessera-learn`, Svelte, and the reserved scripts
- `courses/starter-course/`: a seed course (`course.config.js`, `pages/`, `styles/`, …)
- `shared/`: a design system shared across courses, imported as `$shared` (`Button.svelte`, `tokens.css`)
- `AGENTS.md`: a small pointer to the authoring guide (see below)
- `README.md` and `.gitignore`

A **course** is a self-contained folder under `courses/`, and each one exports to its own LMS package. [What is a workspace?](https://tesseralearn.dev/docs/workspace/) explains the layout.

## AGENTS.md and your assistant

The authoring guide ships with the framework at `node_modules/tessera-learn/AGENTS.md`, with reference files beside it in `node_modules/tessera-learn/docs/`, so it's always current for your installed version. The scaffolded `AGENTS.md` points your assistant (Claude Code, Codex, Cursor, …) at it. It lives at the workspace root only, so open the workspace folder (not an individual course) to keep the guide in scope.

Claude Code reads `AGENTS.md` from v2.1.277, and only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` sits in the workspace or a folder above it ([details](https://code.claude.com/docs/en/memory#agents-md)). On an older version, or with one of those files in place, add a `CLAUDE.md` containing `@AGENTS.md` beside the scaffolded `AGENTS.md`.

## Updating an existing workspace

There is no `create-tessera upgrade` verb: you update by bumping the `tessera-learn` dependency, and every course moves together. Some updates change how courses are written, and some reset learners' saved progress.

The simplest way is to ask your assistant to update the framework. The authoring guide's [update steps](https://github.com/redmodd/tessera/blob/main/packages/tessera-learn/docs/updating.md) have it read the changelog, warn you about anything that resets saved progress before it edits a course, then apply the changes and validate every course.

To update by hand, read the [changelog](https://github.com/redmodd/tessera/blob/main/packages/tessera-learn/CHANGELOG.md) first, then, from the workspace root:

```bash
pnpm add tessera-learn@latest
```

To pin a specific release instead of the newest, name the version: `pnpm add tessera-learn@<version>`. The authoring guide updates with the dependency, and the changelog is also at `node_modules/tessera-learn/CHANGELOG.md`.

An older workspace has a `CLAUDE.md` that duplicates `AGENTS.md`. Project notes live in `AGENTS.md` only: move any notes from `CLAUDE.md` into `AGENTS.md`, then delete `CLAUDE.md`, or replace its contents with `@AGENTS.md` if one of the Claude Code cases above applies.

## Documentation

Guides and examples: [tesseralearn.dev](https://tesseralearn.dev). To customise the build, layouts, or styling, see [Under the hood](https://tesseralearn.dev/docs/under-the-hood/).

## License

MIT
