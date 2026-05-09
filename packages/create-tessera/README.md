# create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/tessera-learn) course.

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

- `course.config.js` — course metadata, navigation, completion, and export settings
- `vite.config.js` — Vite config wired up with the Tessera plugin (do not modify)
- `pages/` — starter section, lesson, and page
- `assets/` — drop images, audio, and video here
- `styles/` — optional CSS overrides
- `AGENTS.md` — the full authoring guide, right in the project root (read by humans and any LLM agent working in the project)

Then:

```bash
cd my-course
npm install
npm run preview   # local dev server at http://localhost:5173
npm run export    # build + package for the configured LMS standard
```

Open the printed URL in your browser — the page hot-reloads as you edit course files. Stop the server with `Ctrl+C`. The scaffolded project's `AGENTS.md` is the full authoring guide.

## Flags

| Flag | Description |
|------|-------------|
| `--template=<name>` | `default` (full starter, components included) or `bare` (hooks-only, layout.svelte, no built-in components). Defaults to `default`. |
| `--help` | Print usage and exit. |
| `--version` | Print scaffolder version and exit. |

## License

MIT
