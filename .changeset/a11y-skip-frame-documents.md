---
'tessera-learn': patch
---

`tessera a11y` no longer reports findings inside embedded frames, such as a YouTube or Vimeo `Video`. It still checks the `<iframe>` itself.
