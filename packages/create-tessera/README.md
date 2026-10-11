# create-tessera

Scaffold a new [Tessera](https://tesseralearn.dev) workspace: a single project that holds many courses.

Tessera is a toolkit for building interactive online courses that play in any LMS (SCORM 1.2, SCORM 2004, cmi5, xAPI 1.0.3, or static Web), designed for AI-assisted authoring: open the scaffolded workspace in Claude Code, Codex, or any tool that reads `AGENTS.md`, and describe the course you want in plain English. This package is the entry point: it generates the workspace (one `package.json` and one `node_modules` shared by every course), wires up the runtime, seeds a first course, and drops `AGENTS.md` at the root so your assistant knows the conventions.

## Prerequisites

Requires **Node.js 24 or later** (which includes `npm`). The scaffolded workspace is set up for **pnpm**; install it with `npm install -g pnpm`. If you have neither, [Getting started](https://tesseralearn.dev/docs/getting-started/) walks through installing both on macOS, Windows, and Linux.

## Usage

```bash
pnpm create tessera@latest my-courses
```

Or equivalently:

```bash
npm create tessera@latest my-courses
yarn create tessera my-courses
```

The scaffolder creates a workspace directory with:

- `package.json`: the one package, which owns `tessera-learn`, Svelte, and the reserved scripts
- `courses/starter-course/`: a seed course (`course.config.js`, `pages/`, `styles/`, …)
- `shared/`: a design system shared across courses, imported as `$shared` (`Button.svelte`, `tokens.css`)
- `AGENTS.md`: a small pointer to the authoring guide (see below)
- `.gitignore`

A **course** is a self-contained folder under `courses/`. The workspace seeds one (`starter-course`); add more with `pnpm tessera new <name>`, which stamps `courses/<name>/` without re-installing (the workspace already owns the dependencies). Each course exports independently to its own LMS package.

The authoring guide ships with the framework at `node_modules/tessera-learn/AGENTS.md`, with reference files beside it in `node_modules/tessera-learn/docs/`, so it's always current for your installed version, with no copy to maintain in the workspace. The scaffolded `AGENTS.md` points your assistant (Claude Code, Codex, Cursor, …) at it. It lives at the workspace root only, so open the workspace folder (not an individual course) to keep the guide in scope.

Claude Code reads `AGENTS.md` from v2.1.277, and only when no `CLAUDE.md` or `CLAUDE.local.md` sits in the workspace or a folder above it ([details](https://code.claude.com/docs/en/memory#agents-md)). On an older version, or with one of those files in place, add a `CLAUDE.md` containing `@AGENTS.md` beside the scaffolded `AGENTS.md`.

An older workspace has a `CLAUDE.md` that duplicates `AGENTS.md`. Project notes live in `AGENTS.md` only: move any notes from `CLAUDE.md` into `AGENTS.md`, then delete `CLAUDE.md`, or replace its contents with `@AGENTS.md` if one of the cases above applies.

The Vite build is owned by the `tessera` CLI: there is no `vite.config.js` to manage. If you need to customise the build (an extra plugin, an alias, a dev-server port), add an optional `tessera.config.js` to the course folder; see the authoring guide.

Every course gets a root `layout.svelte` to customise the course shell and `styles/custom.css` for optional CSS overrides. Add an `assets/` folder to a course for its images, audio, and video.

Then:

```bash
cd my-courses
pnpm install
pnpm dev starter-course      # live preview at http://localhost:5173
pnpm export starter-course   # build + package the course for its configured LMS standard
pnpm validate starter-course # check the course for structural errors, no server or build
pnpm check starter-course    # validate, then the runtime accessibility audit (axe) over the built course
pnpm tessera new <name>      # add another course at courses/<name>/
pnpm tessera duplicate <source> <new>   # copy an existing course to courses/<new>/
```

The root scripts forward to whichever course you name: `pnpm dev <course>` runs that course, while a bare command at the workspace root lists the available courses rather than guessing.

The runtime audit drives Playwright; the first run installs the Chromium browser automatically if it's missing.

Open the printed URL in your browser. The page hot-reloads as you edit course files. Stop the preview with `Ctrl+C`.

## Updating an existing workspace

Updating is a plain dependency bump: there is no `create-tessera upgrade` verb. Some updates change how courses are written, and some reset learners' saved progress, so read the [changelog](https://github.com/redmodd/tessera/blob/main/packages/tessera-learn/CHANGELOG.md) first, or ask your assistant to apply it for you. Then, from the workspace root:

```bash
pnpm add tessera-learn@latest
```

To pin a specific release instead of the newest (for reproducible builds, or to avoid an unwanted major), name the version: `pnpm add tessera-learn@<version>` (or edit the version in `package.json` and run `pnpm install`). The whole workspace shares the one dependency, so every course moves together.

The framework owns the build (`tessera dev`/`export`), the reserved scripts, and the authoring guide, so none of those need reconciling in your workspace. The guide lives in `node_modules/tessera-learn/AGENTS.md`, so bumping the dependency updates it automatically, and your `AGENTS.md` pointer doesn't change.

## Documentation

Guides and examples: [tesseralearn.dev](https://tesseralearn.dev).

## Flags

| Flag           | Description           |
| -------------- | --------------------- |
| `--help`, `-h` | Print usage and exit. |

## License

MIT
