---
'tessera-learn': patch
---

`tessera a11y` no longer reports findings inside cross-origin frames, such as a YouTube or Vimeo `Video`. It still checks the `<iframe>` itself and same-origin frames. It needs `@axe-core/playwright` 4.3 or later.
