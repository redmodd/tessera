---
'tessera-learn': minor
---

Add `--tessera-on-primary` and `--tessera-primary-on-bg` so a light primary color can theme buttons, links and selection indicators with enough contrast. `--tessera-primary-light` is renamed `--tessera-primary-bg` and is now a translucent tint, and `--tessera-primary-dark` is renamed `--tessera-primary-hover`: update any course CSS that uses the old names. The quiz score label uses the success and error colors, so it follows a dark theme. The authoring guide covers light primaries and dark themes.
