---
'tessera-learn': patch
'create-tessera': patch
---

Scaffold pass-through root scripts instead of baking in the seed course name. Previously `dev`/`export`/`validate`/`a11y`/`check` were wired as `tessera <cmd> starter-course`, so in a multi-course workspace `pnpm dev <other-course>` silently ran the seed (the extra arg was swallowed) and a bare `pnpm dev` ran the seed instead of erroring. The scripts now pass straight through to the CLI: `pnpm dev <course>` runs that course, and a bare `pnpm dev` errors and lists the available courses — matching the documented "a bare command never silently picks one" behaviour.
