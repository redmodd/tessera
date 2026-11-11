---
'tessera-learn': patch
---

A page, lesson or section named with `_` gets a default title split at the `_` (`my_page` → "My Page"). `tessera new` no longer splits a course name at `.` for its title (`v1.2-intro` → "V1.2 Intro", `my.course` → "My.course"). The heading-order check no longer counts heading tags written inside a `{...}` string.
