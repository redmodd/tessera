---
'tessera-learn': patch
---

The `--tessera-primary-light` and `--tessera-primary-dark` shades and the `Callout` backgrounds now derive from the theme colors in CSS, so a `--tessera-primary` set on `:root` in a course stylesheet tints them too. A primary color the browser can't parse, from `branding.primaryColor` or a stylesheet, falls back to the default.
