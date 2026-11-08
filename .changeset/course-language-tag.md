---
'tessera-learn': patch
---

Course text sent to the LMS or LRS is tagged with the course `language` instead of `en-US`: the `cmi5.xml` and `tincan.xml` title and description, question and option text in xAPI and cmi5 statements, the plain xAPI course activity, and `cmi.interactions.n.description` in SCORM 2004 (as a `{lang=}` prefix, shortened to a form Moodle accepts, such as `ca-ES` for `ca-ES-valencia`). A missing or malformed `language` falls back to `en`, as `<html lang>` does.

**Behavior change:** a course without a `language`, or with `language: 'en'`, now reports these texts under `en` rather than `en-US`. Verb names stay `en-US`.

**Behavior change:** the build checks `language` more strictly. A malformed tag it used to accept, such as `en-x` or `en-US-US`, now warns and falls back to `en`, in `<html lang>` too.
