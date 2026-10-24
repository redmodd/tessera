---
'tessera-learn': patch
---

Changing page moves focus to the new page's first visible heading, so screen readers announce the page. The browser tab title becomes "Page title – Course title". Page content now renders inside a `div.tessera-page`, so custom layout CSS that targets page elements with a child selector such as `main > h1` needs updating.
