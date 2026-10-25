---
'tessera-learn': minor
---

**Breaking:** page content renders inside a `div.tessera-page`, so layout CSS that reaches page elements with a child selector such as `main > h1` stops matching. To upgrade, write it as `.tessera-page > h1`.

Changing page moves focus to the new page's heading (its `h1`, or else its first heading), so screen readers announce the page. The browser tab title becomes "Page title – Course title".
