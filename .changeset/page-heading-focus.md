---
'tessera-learn': patch
---

Changing page moves focus to the new page's first visible heading (its `h1` when it has one), so screen readers announce the page and Tab starts in its content. The first page, a page that moves focus itself, and the load-error page keep their focus. The browser tab title becomes "Page title – Course title". Page content now renders inside a `div.tessera-page`, so custom layout CSS that targets page elements with a child selector such as `main > h1` needs updating.
