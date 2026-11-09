---
'tessera-learn': patch
---

The `--tessera-primary-light` and `--tessera-primary-dark` shades and the `Callout` backgrounds now derive from the theme colors in CSS, so a `--tessera-primary` set on `:root` in a course stylesheet tints them too. A `branding.primaryColor` the browser can't parse is ignored with a console warning, and a base theme color in a course stylesheet that isn't a color, such as a gradient on `--tessera-bg`, falls back to its default.
