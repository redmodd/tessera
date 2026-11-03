---
'tessera-learn': minor
---

Questions report their text to the LMS: `useQuestion` takes an optional `text`, which built-in questions fill from `question`. It goes out as the Answered statement's `definition.description` in xAPI and cmi5, and as `cmi.interactions.n.description` in SCORM 2004.

Answered statements in xAPI and cmi5 name the launch activity as `parent` instead of `grouping`. Plain xAPI also sends the course title and description on the course activity.
