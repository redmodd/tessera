# __PROJECT_NAME__

> Edit this README to describe your course library.

A [Tessera](https://tesseralearn.dev) workspace: many courses
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
pnpm export <course>     # build a SCORM / cmi5 / xAPI / web package
```

Authoring with an AI assistant? See [`AGENTS.md`](./AGENTS.md): it loads the authoring
guide and has a **Project notes** section where you add your own context (audience,
tone, brand). If Claude Code does not pick it up, add a `CLAUDE.md` containing
`@AGENTS.md` beside it (see
[when Claude Code reads `AGENTS.md`](https://code.claude.com/docs/en/memory#agents-md)).
