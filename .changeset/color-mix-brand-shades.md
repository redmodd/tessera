---
'tessera-learn': patch
---

The `--tessera-primary-bg` and `--tessera-primary-hover` shades and the `Callout` backgrounds now derive from the theme colors in CSS, so they follow a `--tessera-primary` set on `:root` in a course stylesheet. A base theme color in a course stylesheet that isn't a color, such as a gradient on `--tessera-bg`, falls back to its default.
