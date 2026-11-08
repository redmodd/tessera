---
'tessera-learn': patch
---

Course text sent to the LMS or LRS is tagged with the course `language` instead of `en-US`: the `cmi5.xml` and `tincan.xml` title and description, question and option text in xAPI and cmi5 statements, the plain xAPI course activity, and `cmi.interactions.n.description` in SCORM 2004 (as a `{lang=}` prefix, shortened to a form Moodle accepts, such as `ca-ES` for `ca-ES-valencia`).

**Behavior change:** `language` is required. A missing or malformed tag (such as `en-x` or `en_US`) fails the build, and `a11y.ignore` no longer covers it. The error says how to find a valid tag.

**Behavior change:** a course with `language: 'en'` now reports these texts under `en` rather than `en-US`. Verb names stay `en-US`.
