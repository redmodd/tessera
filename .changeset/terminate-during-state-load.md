---
'tessera-learn': patch
---

Closing a cmi5 or xAPI course while its saved state is still loading now sends `Terminated` with the session's duration and stops retrying the load, leaving the saved state and LMS statuses untouched.
