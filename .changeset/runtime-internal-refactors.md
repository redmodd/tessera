---
'tessera-learn': patch
---

Internal refactors with no public API change: completion/success now derive via
Svelte 5 `$derived`, the config validator and cmi5/SCORM mastery-score parsing
share extracted helpers, branding color math moves into a unit-tested module,
`RevealModal` re-platforms onto the native `<dialog>` element (props and styling
unchanged), and the virtual-module and xAPI actor-resolution internals are
simplified.
