---
"create-tessera": patch
---

Move scaffolder templates from inline string literals to real on-disk template
directories (`templates/base`, `templates/default`, `templates/bare`) copied by a
token-substituting walker, and make the post-scaffold "Next steps" hint
package-manager-aware (npm/pnpm/yarn/bun via `npm_config_user_agent`). Internal
refactor — generated projects are unchanged apart from the install hint.
