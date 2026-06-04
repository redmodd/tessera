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
`pnpm tessera dev <name>` (or cd into its folder and run `pnpm exec tessera dev`). The framework guide always
matches your installed `tessera-learn` version, so there's nothing to keep in sync
above this line.

---

## Project notes

Add your own context for the agent here — it takes precedence over the framework
guide above. For example:

- **Audience** — who these courses are for (role, prior knowledge).
- **Voice & tone** — how content should read.
- **Brand & a11y** — colors, logos, contrast or reading-level requirements.
- **Review** — SMEs or stakeholders who sign off, and any naming conventions.

_(Delete the examples and write your own.)_
