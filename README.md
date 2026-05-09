# Tessera

Tessera is a toolkit for building interactive online courses that play in any learning management system. **It's designed for AI-assisted authoring.**

Open your course in an AI coding assistant like [Claude Code](https://claude.com/code), [Cursor](https://cursor.com), [Aider](https://aider.chat), or any tool that reads `AGENTS.md`, and describe what you want in plain English. The assistant uses `AGENTS.md` (shipped at the root of every scaffolded project) to write properly-structured pages, build whatever components you need against the hooks API, wire up quizzes, and configure your LMS export. Built-in components (`Callout`, `Image`, `MultipleChoice`, etc.) are included as reference examples; the assistant uses them where they fit and writes new ones where they don't.

**There's no required look, layout, or component set.** Tessera locks the LMS data contract (tracking, completion, scoring, navigation, persistence) and gets out of the way of the design. Anything you can build with HTML, CSS, and Svelte works.

When you're done, one command packages your course as SCORM 1.2, SCORM 2004, cmi5, or a static web bundle. Completion, scores, and bookmarking report back to the LMS automatically. The same source builds for every standard, so you don't maintain four versions.

*Under the hood:* Tessera is a runtime built on Svelte and Vite. Pages are `.svelte` files. You can edit them directly in code; the AI assistance is there to do the heavy lifting on whatever you'd rather not type by hand.

## Prerequisites

Tessera requires **Node.js 24 or later** (which includes `npm`). If you already have it, jump to [Quick start](#quick-start). Otherwise:

- **macOS:** Download the macOS Installer (`.pkg`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.
- **Windows:** Download the Windows Installer (`.msi`) from [nodejs.org/en/download](https://nodejs.org/en/download) and run it. The default options are fine.

Open a **new** Terminal (macOS) or PowerShell / Command Prompt (Windows) window after installing and confirm:

```bash
node --version    # should print v24.x.x or higher
```

**Editor (optional):** You can edit course files in any text editor, but [Visual Studio Code](https://code.visualstudio.com/) is a good free choice. Install the [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) extension for syntax highlighting on `.svelte` files.

## Quick start

```bash
npm create tessera@latest my-course
cd my-course
npm install
npm run preview   # local dev server at http://localhost:5173
npm run export    # build + package for the configured standard
```

Open the printed URL (`http://localhost:5173`) in your browser. The page hot-reloads as you edit course files. Stop the server with `Ctrl+C`.

Every scaffolded project ships with `AGENTS.md` at its root. Open it for the full authoring guide (creating pages, components, hooks, quizzes, custom layouts, custom xAPI).

```svelte
<script module>
  export const pageConfig = { title: "Welcome" };
</script>

<script>
  import { Callout } from 'tessera-learn';
</script>

<h1>Welcome to the course</h1>
<Callout type="tip"><p>Drop in components for richer content.</p></Callout>
```

*Want a minimal starting point with no reference components?* `npm create tessera@latest -- --template=bare my-course` scaffolds a hooks-only project, useful when you'd rather have the agent build everything from scratch.

## Authoring with AI

Once your project is running, ask the agent for what you want:

> *"Add a new section called 'Workplace Safety' with three lessons: an intro page, a video page using `safety-overview.mp4` from assets, and a quiz with five multiple-choice questions about hazard recognition."*

`AGENTS.md` (at the root of your project) teaches the agent the conventions: how pages, sections, and lessons are organized; how `pageConfig` and `course.config.js` work; which built-in components exist; and how to author new components against the hooks API (`useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `usePersistence`). Anything the built-ins do, an agent-authored component can do, with the same scoring, LMS reporting, and persistence.

You review the output, ask for changes, and iterate. The dev server hot-reloads as the agent writes, so you see each change immediately.

## Troubleshooting

**`command not found: npm`**: Node isn't installed, or your terminal hasn't picked it up yet. Close and reopen the terminal window after installing Node. If it's still missing, re-run the installer from [nodejs.org/en/download](https://nodejs.org/en/download).

**`engine "node" is incompatible` or similar version errors**: your Node version is older than 24. Run `node --version` to check, then install the current version from [nodejs.org/en/download](https://nodejs.org/en/download).

**`Port 5173 is already in use`**: another dev server is running. Either close it, or let Tessera pick the next port (it'll print the new URL; open that one).

**`npm install` fails with network errors**: check your internet connection and retry. If you're behind a corporate proxy or firewall, npm needs proxy configuration (search "npm proxy settings" or ask your IT team).

**Permission errors during `npm install`**: don't use `sudo`. See [npm's guide to resolving EACCES errors](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

**The browser shows a blank page after `npm run preview`**: open your browser's developer console (`F12` → Console tab) for the actual error. Common causes: a typo in a `.svelte` file, an unclosed tag, or a missing asset reference.

Still stuck? [Open an issue](https://github.com/redmodd/tessera/issues) with what you ran and what you saw.

## Documentation

The authoring guide (components, hooks, quizzes, layouts, custom xAPI, the full `course.config.js` shape) lives in [`AGENTS.md`](./AGENTS.md), shipped at the root of every scaffolded project for both human authors and AI agents.

## Contributing

Want to contribute to Tessera itself (not author a course)? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repo layout, build commands, test setup, and release process.

## License

MIT © Derek Redmond
