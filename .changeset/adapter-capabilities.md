---
'tessera-learn': patch
---

cmi5 and xAPI builds, and any build with an explicit xAPI destination, now bundle only their own adapter.

An explicit xAPI destination whose learner actor can't be derived from the SCORM LMS is skipped with a warning that says why, instead of failing on a missing `xapi.actor`.

In dev without launch parameters, a send to a cmi5 or xAPI explicit destination with no actor now fails with an error, as it already did under SCORM, instead of the destination being skipped.
