---
'tessera-learn': minor
---

Course text sent to the LMS or LRS (the cmi5.xml and tincan.xml course name and description, question and option text, and the SCORM 2004 interaction description) is tagged with the course `language` in canonical form (`EN-gb` becomes `en-GB`) instead of `en-US`. SCORM 2004 shortens the tag to a form Moodle accepts, such as `ca-ES` for `ca-ES-valencia`.

**Breaking:** `language` is required. A missing or malformed tag (such as `en-x` or `en_US`), or one that names no language (`und`, `mul`, `zxx`), fails the build, and `a11y.ignore` no longer covers it. To upgrade, set `language` to the course's tag, such as `en` or `fr-CA`.

**Behavior change:** a course with `language: 'en'` now reports these texts under `en` rather than `en-US`. Set `language: 'en-US'` to keep `en-US`. Verb names stay `en-US`.
