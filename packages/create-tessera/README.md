# create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/tessera-learn) course.

Tessera is a toolkit for building interactive online courses that play in any LMS (SCORM 1.2, SCORM 2004, cmi5, or static Web), designed for AI-assisted authoring: open the scaffolded project in Claude Code, Codex, or any tool that reads `AGENTS.md`, and describe the course you want in plain English. This package is the entry point — it generates the project, wires up the runtime, and drops `AGENTS.md` at the root so the agent knows the conventions.

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
pnpm create tessera@latest my-course
```

Or equivalently:

```bash
npm create tessera@latest my-course
yarn create tessera my-course
```

The scaffolder creates a new directory with:

- `course.config.js`: course metadata, navigation, completion, and export settings
- `pages/`: starter section, lesson, and page
- `AGENTS.md` and `CLAUDE.md`: small pointers to the authoring guide (see below)
- `.gitignore`

The full authoring guide ships with the framework at `node_modules/tessera-learn/AGENTS.md`, so it's always current for your installed version — there's no copy to maintain in the project. The scaffolded `CLAUDE.md` imports it (Claude Code reads `CLAUDE.md` and loads the guide automatically); the scaffolded `AGENTS.md` points other agents (Codex, Cursor, …) at the same file.

The Vite build is owned by the `tessera` CLI — there is no `vite.config.js` to manage. If you need to customise the build (an extra plugin, an alias, a dev-server port), add an optional `tessera.config.js`; see the authoring guide.

Both templates also create `assets/` (drop images, audio, video here) and `styles/`. The `default` template seeds `styles/custom.css` with optional CSS overrides; the `bare` template leaves both folders empty and additionally creates a `layout.svelte` at the project root for you to customise.

Then (the project is set up for `pnpm` — Node's corepack provisions it automatically):

```bash
cd my-course
pnpm install
pnpm dev                     # local dev server at http://localhost:5173
pnpm export                  # build + package for the configured LMS standard
pnpm validate                # check the project for structural errors, no server or build
pnpm check                   # validate, then the runtime accessibility audit (axe) over the built course
```

The runtime audit drives Playwright, which needs a browser binary once per machine:

```bash
pnpm exec playwright install chromium
```

Open the printed URL in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`. The full authoring guide is at `node_modules/tessera-learn/AGENTS.md` (your `CLAUDE.md` / `AGENTS.md` point to it).

## Updating an existing project

Updating is a plain dependency bump — there is no `create-tessera upgrade` verb. From the project root:

```bash
pnpm add tessera-learn@latest
```

The framework owns the build (`tessera dev`/`export`), the reserved scripts, and the authoring guide, so nothing in your project tree needs reconciling. The guide lives in `node_modules/tessera-learn/AGENTS.md`, so bumping the dependency updates it automatically — your `CLAUDE.md` / `AGENTS.md` pointers don't change.

> **Projects scaffolded before this model** still have `"dev": "vite dev"` scripts, a `vite` devDependency, and a `vite.config.js`. To move them over once: change the four scripts to `tessera dev` / `tessera export` / `tessera validate` / `tessera check`, drop `vite` and `@sveltejs/vite-plugin-svelte` from `devDependencies`, and delete `vite.config.js`.

## Flags

| Flag                | Description                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--template=<name>` | `default` (full starter, components included) or `bare` (hooks-only, layout.svelte, no built-in components). Defaults to `default`. |
| `--help`, `-h`      | Print usage and exit.                                                                                                               |

## License

MIT
