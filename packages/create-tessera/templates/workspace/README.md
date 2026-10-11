# __PROJECT_NAME__

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
pnpm export <course>     # build a SCORM / cmi5 / xAPI / web package
```

Authoring with an AI agent? `AGENTS.md` and `CLAUDE.md` both load the full guide, and
each has a **Project notes** section for your own context (audience, tone, brand).
Claude Code reads `CLAUDE.md`; other agents read `AGENTS.md`. Add your notes to the
one your agent reads.
