---
'tessera-learn': minor
'create-tessera': minor
---

New workspaces no longer get a `CLAUDE.md`: agents read the root `AGENTS.md`. Claude Code reads it from v2.1.277, and only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` sits in the workspace or a folder above it. On an older version, or when scaffolding inside a project that has one of those files, add a `CLAUDE.md` containing `@AGENTS.md` to the workspace.

Existing workspaces: Project notes now live in `AGENTS.md` only. Move any notes from `CLAUDE.md` into `AGENTS.md`, then delete `CLAUDE.md`, or replace its contents with `@AGENTS.md` if one of the cases above applies.

The authoring guide is split so `AGENTS.md` holds what every task needs and points to reference files in `node_modules/tessera-learn/docs/` for hooks, recipes, scoring, xAPI and export.
