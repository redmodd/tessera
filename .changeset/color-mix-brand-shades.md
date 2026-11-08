---
'tessera-learn': patch
---

The `--tessera-primary-light` and `--tessera-primary-dark` shades and the `Callout` backgrounds now derive from the theme colors in CSS, so a `--tessera-primary` set on `:root` in a course stylesheet tints them too. A `branding.primaryColor` the browser can't parse is now ignored, so the course keeps the default primary color.
