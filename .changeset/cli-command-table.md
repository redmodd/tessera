---
'tessera-learn': patch
---

Every `tessera` subcommand now parses arguments the same way: `--help` works on all of them, flags can come before or after the course name and accept `--flag=value`, and unknown flags or extra arguments are rejected instead of ignored.
