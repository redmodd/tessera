---
'tessera-learn': patch
---

`tessera a11y` now audits every page of a course that uses a custom `layout.svelte`, instead of silently scanning only the entry page and reporting a pass. A page that fails to load at runtime is flagged in the report and fails the audit, rather than being scanned as an accessible error screen.
