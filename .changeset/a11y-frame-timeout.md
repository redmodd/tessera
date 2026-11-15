---
'tessera-learn': patch
---

`tessera a11y` no longer times out on a page that adds a same-origin frame or keeps the network busy. Before scanning a page, it waits for its same-origin frames to load, lazy ones below the fold and nested ones included, and for content the page or those frames fetch. It waits up to 10s per page and warns when a frame or request is still loading after that.
