---
'tessera-learn': minor
---

Questions report their text to the LMS: `useQuestion` takes an optional `text`, which built-in questions fill from `question`. It goes out as the Answered statement's `definition.description` in xAPI and cmi5, and as `cmi.interactions.n.description` in SCORM 2004.

Plain xAPI sends the course title and description on the course activity, and Answered statements name the course as `parent` instead of `grouping`.
