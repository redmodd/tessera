---
'tessera-learn': patch
---

The build's skipped-heading-level warning (such as `<h2>` followed by `<h4>`) now looks only at real heading elements on the page. Text that merely looks like a heading tag, such as the string in `{'<h4>'}`, no longer triggers it.

The warning for a page missing from a lesson's `pages` array now names the lesson's `_meta.js` file, where the fix goes.
