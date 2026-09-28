---
'tessera-learn': patch
---

A cmi5 launch with a missing or relative `endpoint` or a missing `activityId` fails before spending the single-use fetch URL, instead of sending the auth token to the course's own host. cmi5 and xAPI launch errors name the missing launch parameter.
