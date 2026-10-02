---
'tessera-learn': patch
---

Internal refactor: the course session (resume, saving, LMS reporting and exit) moves out of the app shell.

Closing the course while an `xapi` actor resolver is still running now ends the LMS session instead of leaving the attempt open.
