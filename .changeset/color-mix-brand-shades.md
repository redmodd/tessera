---
'tessera-learn': patch
---

The `--tessera-primary-light` and `--tessera-primary-dark` shades and the `Callout` backgrounds now derive from the theme colors in CSS, so a `--tessera-primary` set on `:root` in a course stylesheet tints them too. A `branding.primaryColor` the browser can't parse is ignored, and an unparseable theme color in a course stylesheet falls back to its default.
