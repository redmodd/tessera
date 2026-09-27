---
'tessera-learn': minor
---

**Breaking:** a function in `course.config.js` now fails the build (functions there never worked). Move custom page access rules (`canAccess`) and xAPI `auth`/`actor` resolvers to named exports in a new optional `course.runtime.js`. Each xAPI destination with its own endpoint now needs an `id`, which `course.runtime.js` keys its resolvers by. The authoring guide (`node_modules/tessera-learn/AGENTS.md`) has examples under "Custom access rules" and "Custom xAPI statements".
