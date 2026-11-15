---
'tessera-learn': patch
---

`tessera a11y` no longer times out on a page that adds a same-origin frame or keeps the network busy. Before scanning a page, it waits for content the page fetches and for its same-origin frames to load, lazy ones below the fold included, and warns about a frame that takes over 10s.
