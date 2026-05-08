# tessera-learn

LMS tracking runtime for interactive learning content. One adapter layer (SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web), your choice of components.

## Install

You probably don't want to install this package directly. Use the scaffolder:

```bash
npm create tessera@latest my-course
```

That creates a project with Tessera wired up, a starter page structure, and the authoring guide (`AGENTS.md`) at the project root. Prefer hooks-only? `npm create tessera@latest -- --template=bare my-course` scaffolds without the built-in components.

## Documentation

The full authoring guide ships with this package at `node_modules/tessera-learn/AGENTS.md`, at the root of any scaffolded project, and on [GitHub](https://github.com/redmodd/tessera/blob/main/AGENTS.md).

## License

MIT
