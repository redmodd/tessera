# **PROJECT_NAME**

> Edit this README to describe your course library.

A [Tessera](https://www.npmjs.com/package/tessera-learn) workspace — many courses
under `courses/`, with a shared design system in `shared/` (imported as `$shared`).

## Quick start

```bash
pnpm install
pnpm dev starter-course      # preview a course in the browser
pnpm tessera new <name>      # add a course
```

## Commands

Author:

```bash
pnpm tessera new <name>            # scaffold a new course
pnpm tessera duplicate <src> <to>  # copy an existing course
pnpm dev <course>                  # live preview
```

Ship:

```bash
pnpm validate <course>   # check structure & LMS rules
pnpm a11y <course>       # accessibility audit
pnpm check <course>      # validate + a11y (run before export)
pnpm export <course>     # build a SCORM / cmi5 / web package
```

Authoring with an AI agent? See [`AGENTS.md`](./AGENTS.md) — it loads the full guide
and has a **Project notes** section where you add your own context (audience, tone,
brand).
