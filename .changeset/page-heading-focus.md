---
'tessera-learn': patch
---

Changing page moves focus to the new page's heading (its `h1`, or else its first heading), so screen readers announce the page. Headings a screen reader can't reach are skipped. The browser tab title becomes "Page title – Course title". Page content now renders inside a `div.tessera-page`, so custom layout CSS that targets page elements with a child selector such as `main > h1` needs updating.
