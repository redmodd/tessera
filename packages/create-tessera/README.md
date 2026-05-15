# create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/tessera-learn) course.

Tessera is a toolkit for building interactive online courses that play in any LMS (SCORM 1.2, SCORM 2004, cmi5, or static Web), designed for AI-assisted authoring: open the scaffolded project in Claude Code, Cursor, or any tool that reads `AGENTS.md`, and describe the course you want in plain English. This package is the entry point — it generates the project, wires up the runtime, and drops `AGENTS.md` at the root so the agent knows the conventions.

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
npm create tessera@latest my-course
```

Or equivalently:

```bash
pnpm create tessera my-course
yarn create tessera my-course
```

The scaffolder creates a new directory with:

- `course.config.js`: course metadata, navigation, completion, and export settings
- `vite.config.js`: Vite config wired up with the Tessera plugin (do not modify)
- `pages/`: starter section, lesson, and page
- `AGENTS.md`: the full authoring guide, right in the project root (read by humans and any LLM agent working in the project)
- `.gitignore`

Both templates also create `assets/` (drop images, audio, video here) and `styles/`. The `default` template seeds `styles/custom.css` with optional CSS overrides; the `bare` template leaves both folders empty and additionally creates a `layout.svelte` at the project root for you to customise, plus a project `README.md`.

Then:

```bash
cd my-course
npm install
npm run dev       # local dev server at http://localhost:5173
npm run export    # build + package for the configured LMS standard
npm run validate  # check the project for structural errors, no server or build
```

Open the printed URL in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`. The scaffolded project's `AGENTS.md` is the full authoring guide.

## Upgrading an existing project

Run from a project root to re-apply the latest framework files:

```bash
npx create-tessera@latest upgrade            # apply changes
npx create-tessera@latest upgrade --dry-run  # preview without writing
```

`upgrade` touches only **framework-owned** files: it overwrites `AGENTS.md` and `vite.config.js`, reconciles the reserved npm scripts (`dev`, `export`, `validate`) in `package.json`, and pins `tessera-learn` to the version this CLI ships. Authored files — `course.config.js`, `pages/`, `styles/`, `layout.svelte`, `README.md` — are never touched. If you've changed a reserved script, `upgrade` leaves your version in place and warns.

## Flags

| Flag | Description |
|------|-------------|
| `--template=<name>` | `default` (full starter, components included) or `bare` (hooks-only, layout.svelte, no built-in components). Defaults to `default`. |
| `--dry-run` | (`upgrade` only) Preview changes without writing any files. |
| `--help`, `-h` | Print usage and exit. |

## License

MIT
