---
'tessera-learn': patch
---

`tessera a11y` no longer times out on a page that adds a same-origin frame or keeps the network busy, and it waits for a page's frames to load before scanning them.
