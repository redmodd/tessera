---
'tessera-learn': minor
'create-tessera': minor
---

`svelte` is now a peer dependency (`^5.56.0`) rather than a direct dependency, so a project resolves exactly one copy. Scaffolded projects already declare it; others need `pnpm add -D svelte`.
