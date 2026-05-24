---
'tessera-learn': patch
---

Add static checking to the monorepo: per-package type checking (`svelte-check`
for `tessera-learn`, `tsc --noEmit` for `create-tessera`), an ESLint 9 flat
config (typed `no-floating-promises`, `no-console` as a warning, `no-unused-vars`)
and Prettier, wired into CI as a `static` job. Scripts: `lint`, `check`,
`format`, `format:check`.

Fixes the correctness issues this surfaced in the shipped runtime: three dropped
`await`s on async LMS work — the cmi5 State PUT (`saveState`), the SCORM/cmi5
write-queue flush, and the ZIP `finalize` — are now explicitly sequenced; cmi5
launch-parameter errors attach the underlying error via `cause`; and a handful of
dead bindings, an unused `<video>` `svelte-ignore`, and an unused keyboard
handler were removed. `<AccordionItem>` now derives its element ids from
`$props.id()` instead of a module-level counter. No public API change.
