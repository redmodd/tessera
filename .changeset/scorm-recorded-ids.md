---
'tessera-learn': minor
---

**Behavior change:** SCORM ids and step answers record in a form every LMS accepts, Moodle included, so an LMS report that spans the upgrade can show one question or answer under two values. Nothing in the course needs to change.

- Response ids (options without text, likert values, performance step names) record as letters, digits and `_`, where SCORM 2004 percent-encoded them (`Strongly agree` → `Strongly_agree`, `speed-limit` → `speed_limit`). On SCORM 1.2 and 2004 they drop accents (`café` → `cafe`) and record letters of other scripts as code points (`東京` → `u6771u4EAC`), so they stay distinct.
- SCORM 1.2 interaction ids follow the same rule and keep underscores as written (`_q1` stays `_q1`, was `q1`).
- SCORM 2004 interaction ids replace whitespace and emoji with `_` (`my question` → `my_question`) and a malformed `urn:` prefix with `urn_`, and keep everything else. `tessera validate` warns when a 2004 id will be rewritten, and SCORM courses warn in the console when two question ids record as the same id.
- SCORM 2004 performance step answers record in a form the LMS accepts (`-.5` → `-0.5`, `turn left` → `turn_left`). Grading still reads them as written. Tessera warns when this changes a correct answer, or makes the LMS record and the result disagree on whether an answer matches.
