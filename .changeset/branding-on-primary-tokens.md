---
'tessera-learn': minor
---

Add `--tessera-on-primary` and `--tessera-primary-on-bg` so a light primary color can theme buttons, links and selection indicators with enough contrast. The quiz score label uses the success and error colors, so it follows a dark theme. The authoring guide covers light primaries and dark themes.

**Breaking:** `--tessera-primary-light` and `--tessera-primary-dark` are gone. To upgrade, wherever you set or read them, use `--tessera-primary-bg` (now a translucent tint, so the surface behind it shows through) and `--tessera-primary-hover`.
