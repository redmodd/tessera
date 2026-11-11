---
'tessera-learn': patch
---

When an LRS rejects a statement on the retry after a 401, the error now includes the LRS response, as it does on the first attempt. A network error on that retry is now retried with backoff instead of dropping the statement.
