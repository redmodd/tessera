---
'tessera-learn': patch
---

Closing a cmi5 or xAPI course while its saved state is still loading now sends `Terminated` with the session's duration and cancels the load, leaving the saved state and LMS statuses untouched.

A resumed session's reported duration now counts from launch, like a new session's, so it includes the time spent connecting to the LMS and loading saved state.
