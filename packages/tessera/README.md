# tessera

LMS tracking runtime for interactive learning content. One codebase, one adapter layer (SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web), your choice of components.

## Install

You probably don't want to install this package directly. Use the scaffolder instead:

```bash
npm create @redmondd/tessera@latest my-course
```

That creates a project with Tessera wired up, a starter page structure, and the authoring guide (`AGENTS.md`) dropped at the project root. Prefer hooks-only? `npm create @redmondd/tessera@latest -- --template=bare my-course` scaffolds without the built-in components.

## What you get

- **One adapter layer** — completion, scoring, bookmarking, and suspend_data routed through SCORM 1.2 / SCORM 2004 / cmi5 / web. Switch standards by changing one config field.
- **Hooks API** — `useQuestion`, `useNavigation`, `useProgress`, `usePersistence`. The contract the built-in components are written against; you can build any widget the framework can.
- **Authoring in Svelte** — pages are plain `.svelte` files organized into sections and lessons.
- **Built-in components** — `Callout`, `Image`, `Accordion`, `Carousel`, `RevealModal`, `Video`, `Audio`, plus a quiz system (`MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`). Use, compose, or replace.
- **Custom layouts and access rules** — `layout.svelte` at project root replaces the chrome; `navigation.canAccess` replaces the free/sequential presets.
- **Theming** — override CSS custom properties or drop a file into `styles/`; no framework code changes required.

## Usage sketch

```svelte
<script module>
  export const pageConfig = { title: "Welcome" };
</script>

<script>
  import { Callout } from '@redmondd/tessera';
</script>

<h1>Welcome</h1>
<Callout type="tip"><p>Hello, learner.</p></Callout>
```

Then:

```bash
npm run preview   # local dev server
npm run export    # build + package for the configured LMS standard
```

## Documentation

Full authoring guide: see `AGENTS.md` in the main repository, or open it inside any scaffolded project (it ships at the project root).

## License

MIT
