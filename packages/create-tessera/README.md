# create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/tessera-learn) course.

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
npm run preview   # local dev server
npm run export    # build + package for the configured LMS standard
```

## Flags

| Flag | Description |
|------|-------------|
| `--template=<name>` | `default` (full starter, components included) or `bare` (hooks-only, layout.svelte, no built-in components). Defaults to `default`. |
| `--help` | Print usage and exit. |
| `--version` | Print scaffolder version and exit. |

## License

MIT
