---
'tessera-learn': minor
---

**Breaking:** each xAPI destination with its own endpoint now needs a unique `id`. To upgrade, add one to each. Custom page access rules (`canAccess`) and xAPI `auth`/`actor` resolvers now go in a new optional `course.runtime.js` as named exports, with resolvers keyed by that `id`. Functions in `course.config.js` never worked, and validation now names them and points at `course.runtime.js`. The authoring guide (`node_modules/tessera-learn/AGENTS.md`) has examples under "Custom access rules" and "Custom xAPI statements".
