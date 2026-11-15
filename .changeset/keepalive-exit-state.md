---
'tessera-learn': patch
---

Under cmi5 and xAPI, closing the window sends Terminated and any queued statements even when the saved progress is large. Progress too large to send while the page closes still goes first, but can be lost if the window closes before it arrives. When the last save failed, the Exit button resends the progress and waits for it before sending Terminated.
