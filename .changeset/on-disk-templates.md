---
"create-tessera": patch
---

Move scaffolder templates from inline string literals to real on-disk template
directories (`templates/base`, `templates/default`, `templates/bare`) copied by a
token-substituting walker, and make the post-scaffold "Next steps" hint
package-manager-aware (npm/pnpm/yarn/bun via `npm_config_user_agent`).

Mostly an internal refactor, but scaffolded projects also change in two small
ways: the bare template's demo check question now follows the documented choice
pattern (readable ids + `options`, so SCORM 1.2 export emits the position indexes
SCORM Cloud's strict validator requires), and the scaffolded README/AGENTS.md now
note that the `npm` run commands can be swapped for your package manager.
