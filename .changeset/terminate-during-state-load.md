---
'tessera-learn': patch
---

Closing a cmi5 or xAPI course while its saved state is still loading now sends `Terminated`, and leaves the saved state and LMS statuses untouched.
