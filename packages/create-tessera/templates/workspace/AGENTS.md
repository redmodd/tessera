# Tessera workspace — authoring guide

This is a [Tessera](https://www.npmjs.com/package/tessera-learn) **workspace**. It
owns the dependencies once and holds many courses under `courses/`, with a shared
design system in `shared/` (imported as `$shared`). The full authoring guide —
components, hooks, course structure, LMS export, accessibility, and workspaces —
ships with the framework. Run `pnpm install`, then read it at
`node_modules/tessera-learn/AGENTS.md` before generating or editing course content.

@./node_modules/tessera-learn/AGENTS.md

**Open this workspace folder** (not an individual course) so this guide is in
scope. Add a course with `pnpm tessera new <name>`; run a command against one with
`pnpm tessera dev <name>` (or cd into its folder and run `pnpm exec tessera dev`). The guide always matches your
installed `tessera-learn` version, so there's nothing to keep in sync here.
