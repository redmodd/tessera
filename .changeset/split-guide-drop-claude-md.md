---
'tessera-learn': minor
'create-tessera': minor
---

New workspaces no longer get a `CLAUDE.md`: agents read the root `AGENTS.md`. Claude Code reads it from v2.1.277, and only when no `CLAUDE.md` or `CLAUDE.local.md` sits in the workspace or above it; otherwise add a `CLAUDE.md` containing `@AGENTS.md`. The authoring guide is split so `AGENTS.md` holds what every task needs and points to reference files in `node_modules/tessera-learn/docs/` for hooks, recipes, scoring, xAPI and export.
