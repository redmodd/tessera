---
'tessera-learn': patch
---

Reshape Person-shaped xAPI/cmi5 launch actors into a valid Agent instead of forwarding them to the LRS.
Reject a non-`Agent` `objectType` on a static `xapi.actor` at build time.
Fail the launch with a launch-parameter error when the LMS actor has no usable IFI, instead of a misleading `xapi.actor` config error.
