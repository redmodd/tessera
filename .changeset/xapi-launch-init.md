---
'tessera-learn': patch
---

A cmi5 launch with a relative `endpoint` fails before spending the single-use fetch URL, instead of sending the auth token to the course's own host, and a fetched token that includes the `Basic ` scheme fails before any LRS request. cmi5 and xAPI name the `endpoint` launch parameter in the error. cmi5 launches fetch `LMS.LaunchData` and learner preferences in parallel.
