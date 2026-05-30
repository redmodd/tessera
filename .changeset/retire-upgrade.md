---
'tessera-learn': minor
'create-tessera': minor
---

Collapse the reconciled project surface and retire `create-tessera upgrade`.
The `tessera` CLI now owns `dev` and `export` (Vite run programmatically via a
shared `buildInlineConfig`, with an optional `tessera.config.js` escape hatch),
so scaffolded projects no longer carry a `vite.config.js` or a `vite`
devDependency — `vite` is now a `tessera-learn` dependency. Scaffolded npm
scripts are pure `tessera <x>` aliases. The canonical authoring guide moves into
`tessera-learn` (shipped in its `files`, so it installs at
`node_modules/tessera-learn/AGENTS.md`); scaffolded projects no longer carry a
copy — they get small `CLAUDE.md` (imports the guide for Claude Code) and
`AGENTS.md` (pointer for other agents) stubs, so the guide updates with the
dependency. Updating a course is now a plain `pnpm add tessera-learn@latest`.
Projects scaffolded before this change need a one-time manual edit (swap scripts
to `tessera <x>`, drop `vite` / `@sveltejs/vite-plugin-svelte`, delete
`vite.config.js`).
