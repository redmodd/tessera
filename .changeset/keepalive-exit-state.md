---
'tessera-learn': patch
---

Under cmi5 and xAPI, closing the window sends Terminated, and any statements still waiting, even when the saved state is large. The exit state still goes first, but without `keepalive` when it does not fit in what they leave of the browser's 64 KiB quota. When the last save failed, the Exit button now sends the exit state the same way and waits for it before sending Terminated.
