---
'tessera-learn': patch
---

`tessera a11y` no longer reports findings inside cross-origin frames, such as a YouTube or Vimeo `Video`. It needs `@axe-core/playwright` 4.3 or later and asks for an upgrade when an older copy is installed.
