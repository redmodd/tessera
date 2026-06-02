---
'tessera-learn': patch
'create-tessera': patch
---

`tessera a11y` now audits every page of a course that ships a custom `layout.svelte`. Page enumeration is driven by the course manifest over a layout-independent navigation hook instead of the default layout's sidebar buttons, so custom-layout courses are no longer silently audited at only their entry page. The report also records `pagesAudited`/`totalPages`, and a run that can't reach every page warns and records the reduced scope rather than reporting an unqualified pass.
