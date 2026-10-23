---
'tessera-learn': patch
---

`--tessera-success` and `--tessera-error` default to darker shades (`#147638`, `#b91c1c`) so quiz feedback text meets WCAG AA contrast (4.5:1), including on its tinted backgrounds. The quiz score label now uses these colors directly.

Matching pair badges use darker colors so their numbers meet AA contrast, and no pair color matches the error color.
