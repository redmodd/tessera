---
'tessera-learn': minor
'create-tessera': minor
---

The `tessera` CLI now owns the build: `tessera dev` / `tessera export` run Vite
programmatically, so scaffolded projects no longer carry `vite.config.js` or a
`vite` devDependency (`vite` moved into `tessera-learn`). Need to customise the
build? Add an optional `tessera.config.js`. Updating a course is now just
`pnpm add tessera-learn@latest` — the `create-tessera upgrade` command is gone.

The authoring guide now ships with `tessera-learn` (at
`node_modules/tessera-learn/AGENTS.md`); scaffolded projects get small
`CLAUDE.md` / `AGENTS.md` pointer stubs instead of a copy, so it updates with the
dependency.

**Migrating a project scaffolded before this release:** swap the npm scripts to
`tessera dev` / `tessera export` / `tessera validate` / `tessera check`, drop
`vite` and `@sveltejs/vite-plugin-svelte` from `devDependencies`, and delete
`vite.config.js`.
