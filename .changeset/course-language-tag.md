---
'tessera-learn': patch
---

Course text sent to the LMS or LRS (manifest titles, question and option text, and the SCORM 2004 interaction description) is tagged with the course `language` in canonical form (`EN-gb` becomes `en-GB`) instead of `en-US`. SCORM 2004 shortens the tag to a form Moodle accepts, such as `ca-ES` for `ca-ES-valencia`.

**Behavior change:** `language` is required. A missing or malformed tag (such as `en-x` or `en_US`) fails the build, and `a11y.ignore` no longer covers it. The error says how to find a valid tag.

**Behavior change:** a course with `language: 'en'` now reports these texts under `en` rather than `en-US`. Verb names stay `en-US`.
