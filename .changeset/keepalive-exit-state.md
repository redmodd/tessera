---
'tessera-learn': patch
---

Under cmi5 and xAPI, closing the window sends Terminated, and any statements still waiting, even when the saved state is large. The exit state is sent after them, and without `keepalive` when it does not fit in what they leave of the browser's 64 KiB quota.
