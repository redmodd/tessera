---
'tessera-learn': patch
---

Course text sent to the LMS or LRS is tagged with the course `language` instead of `en-US`: the `cmi5.xml` and `tincan.xml` title and description, question and option text in xAPI and cmi5 statements, the plain xAPI course activity, and `cmi.interactions.n.description` in SCORM 2004 (as a `{lang=}` prefix). A missing or malformed `language` falls back to `en`, as `<html lang>` does.

**Behavior change:** a course without a `language`, or with `language: 'en'`, now reports these texts under `en` rather than `en-US`. Verb names stay `en-US`.
