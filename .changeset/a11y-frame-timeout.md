---
'tessera-learn': patch
---

`tessera a11y` no longer times out on a page that adds a frame. Before scanning each page, it waits up to 10s for the page's frames and fetched content to load, and warns when something is still loading.
