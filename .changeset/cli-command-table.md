---
'tessera-learn': minor
---

**Breaking:** `tessera dev`, `new` and `duplicate` now reject flags and extra arguments they used to ignore. To upgrade, remove them from any scripts that call these commands.

Every `tessera` subcommand now parses arguments the same way: `--help` works on all of them and prints the full command list, flags can come before or after the course name and accept `--flag=value`, and unknown flags, missing arguments and extra arguments are rejected with the same `[tessera <command>]` prefix.
