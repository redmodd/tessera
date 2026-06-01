# create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/tessera-learn) workspace — a single project that holds many courses.

Tessera is a toolkit for building interactive online courses that play in any LMS (SCORM 1.2, SCORM 2004, cmi5, or static Web), designed for AI-assisted authoring: open the scaffolded workspace in Claude Code, Codex, or any tool that reads `AGENTS.md`, and describe the course you want in plain English. This package is the entry point — it generates the workspace (one `package.json` and one `node_modules` shared by every course), wires up the runtime, seeds a first course, and drops `AGENTS.md` at the root so the agent knows the conventions.

## Prerequisites

Requires **Node.js 24 or later** (which includes `npm`). If you already have it, jump to [Usage](#usage). Otherwise:

- **macOS:** Download the macOS Installer (`.pkg`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.
- **Windows:** Download the Windows Installer (`.msi`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.

Open a **new** Terminal (macOS) or PowerShell / Command Prompt (Windows) window after installing and confirm:

```bash
node --version    # should print v24.x.x or higher
```

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

- `package.json`: the one package — owns `tessera-learn`, Svelte, and the reserved scripts
- `courses/getting-started/`: a seed course (`course.config.js`, `pages/`, `styles/`, …)
- `shared/`: a design system shared across courses, imported as `$shared` (`Button.svelte`, `tokens.css`)
- `AGENTS.md` and `CLAUDE.md`: small pointers to the authoring guide (see below)
- `.gitignore`

A **course** is a self-contained folder under `courses/`. The workspace seeds one (`getting-started`); add more with `pnpm tessera new <name>`, which stamps `courses/<name>/` without re-installing (the workspace already owns the dependencies). Each course exports independently to its own LMS package.

The full authoring guide ships with the framework at `node_modules/tessera-learn/AGENTS.md`, so it's always current for your installed version — there's no copy to maintain in the workspace. The scaffolded `CLAUDE.md` imports it (Claude Code reads `CLAUDE.md` and loads the guide automatically); the scaffolded `AGENTS.md` points other agents (Codex, Cursor, …) at the same file. Both live at the workspace root only — open the workspace folder (not an individual course) so the guide stays in scope and `$shared` resolves.

The Vite build is owned by the `tessera` CLI — there is no `vite.config.js` to manage. If you need to customise the build (an extra plugin, an alias, a dev-server port), add an optional `tessera.config.js`; see the authoring guide.

Every course gets `assets/` (drop images, audio, video here), a root `layout.svelte` to customise the course shell, and `styles/custom.css` for optional CSS overrides.

Then (the workspace is set up for `pnpm` — Node's corepack provisions it automatically):

```bash
cd my-courses
pnpm install
pnpm dev                     # local dev server at http://localhost:5173 (runs the getting-started course)
pnpm export                  # build + package the getting-started course for its configured LMS standard
pnpm validate                # check the getting-started course for structural errors, no server or build
pnpm check                   # validate, then the runtime accessibility audit (axe) over the built course
pnpm tessera new <name>      # add another course at courses/<name>/
```

The root scripts target the seed course `getting-started`. To run a command against a different course, name it (`tessera dev <name>`) or `cd` into its folder and run the command bare. A bare command at the workspace root lists the available courses rather than guessing.

The runtime audit drives Playwright, which needs a browser binary once per machine:

```bash
pnpm exec playwright install chromium
```

Open the printed URL in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`. The full authoring guide is at `node_modules/tessera-learn/AGENTS.md` (your `CLAUDE.md` / `AGENTS.md` point to it).

## Updating an existing workspace

Updating is a plain dependency bump — there is no `create-tessera upgrade` verb. From the workspace root:

```bash
pnpm add tessera-learn@latest
```

To pin a specific release instead of the newest — for reproducible builds, or to avoid an unwanted major — name the version: `pnpm add tessera-learn@0.1.0` (or edit the version in `package.json` and run `pnpm install`). The whole workspace shares the one dependency, so every course moves together.

The framework owns the build (`tessera dev`/`export`), the reserved scripts, and the authoring guide, so nothing in your workspace tree needs reconciling. The guide lives in `node_modules/tessera-learn/AGENTS.md`, so bumping the dependency updates it automatically — your `CLAUDE.md` / `AGENTS.md` pointers don't change.

## Flags

| Flag           | Description           |
| -------------- | --------------------- |
| `--help`, `-h` | Print usage and exit. |

## License

MIT
