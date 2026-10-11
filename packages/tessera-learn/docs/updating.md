# Updating the framework

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

Run every step from the workspace root. The workspace has one `tessera-learn` dependency, so every course moves together.

1. Note the installed version: `version` in `node_modules/tessera-learn/package.json`.
2. `pnpm add tessera-learn@latest` (or `tessera-learn@<version>` to pin).
3. Read `node_modules/tessera-learn/CHANGELOG.md` for every version above the old one, up to the one now installed.
4. Before editing anything, tell the author about every entry labelled **Saved progress reset**, and any other entry under which learners lose saved progress or saved state: learners start over when the re-exported course replaces the old one in the LMS. Ask whether to go on. To stay on the old version, `pnpm add tessera-learn@<old version>` and stop.
5. Re-read `node_modules/tessera-learn/AGENTS.md`, and the `docs/` files a change touches. The copy loaded at the start of the session describes the old version.
6. Apply the changes those entries list, to the workspace and to every course. Entries labelled **Breaking** or **Behavior change** always need a look.
7. Run `pnpm validate <course>` on every course and fix what it reports.

The framework owns the build, reserved scripts and this guide, so those need no reconciling. The root `AGENTS.md` is never overwritten: put workspace standards in its Project notes.
