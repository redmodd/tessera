# Export and LMS behaviour

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

## Build output

`pnpm export <course>` writes into the course folder:

| `export.standard` | What ships                                  | Where                     |
| ----------------- | ------------------------------------------- | ------------------------- |
| `web`             | Static site (HTML/CSS/JS + `assets/`)       | `dist/` (any static host) |
| `scorm12`         | SCORM 1.2 package                           | `<title>-<version>.zip`   |
| `scorm2004`       | SCORM 2004 4th Edition package              | `<title>-<version>.zip`   |
| `cmi5`            | cmi5 package (AU + manifest)                | `<title>-<version>.zip`   |
| `xapi`            | xAPI 1.0.3 "Tin Can" package (`tincan.xml`) | `<title>-<version>.zip`   |

`<title>` is the slugified `title` and `<version>` the `version` from `course.config.js` (`my-course-1.0.0.zip`). The name carries no standard, and each packaged export first deletes every `<title>-*.zip` in the course folder.

Upload the zip via your LMS's import flow; drop `dist/` (web) on any static host.

To package one course for several LMSs, export once per `--standard` and move each zip out of the course folder before the next export. An unknown `--standard` value fails before the build runs.

## Web export Content-Security-Policy

Web builds emit a baseline CSP `<meta>` (LMS packages and the dev server don't). It allows any `https:` for images/media/frames/network, but **not** for scripts, styles, or fonts, so a CDN script/stylesheet/font is blocked until you allow its origin. Extend per-directive via `export.csp` (sources are **appended** to the baseline, never replaced):

```js
export: {
  standard: 'web',
  csp: {
    'style-src': ['https://fonts.googleapis.com'],
    'font-src': ['https://fonts.gstatic.com'],
  },
}
```

- `export.csp: false` drops the meta entirely (use when your host sets a CSP header).
- To **tighten** or replace a directive, use a `transformIndexHtml` hook: `export.csp` only adds.
- Ignored unless `standard` is `'web'`.

## LMS behaviour

The runtime translates author intent into adapter calls automatically. The author-relevant differences:

| Concern              | SCORM 1.2                                                                                                              | SCORM 2004 4th                                                 | cmi5 / xapi                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| Completion + success | One field (`lesson_status`) with no "unknown"; `passed` waits for completion, `failed` for completion or a final score | Two independent fields (`completion_status`, `success_status`) | Completed + Passed/Failed statements |
| Score scale to LMS   | `score.raw` (0–100)                                                                                                    | `score.raw` (0–100) **and** `score.scaled` (0–1)               | `result.score.scaled` (0–1)          |
| Saved state cap      | ~4 KB (plan for 4096 bytes)                                                                                            | 64000 bytes                                                    | LRS-defined (typically unbounded)    |
| Resume after reload  | From `cmi.suspend_data`                                                                                                | From `cmi.suspend_data`                                        | From `tessera-state` (State API)     |

Author-facing consequences:

- **A failing learner who cannot complete stays `incomplete` on SCORM 1.2 until the score is final**, then exits as `failed`. The score is final once every graded page, optional ones included, has scored 100 or run out of tries: a quiz its `maxAttempts`, each graded `useQuestion` its `maxRetries`. Without those limits it never is, and neither is it while a failed `gatesProgress` quiz locks a graded page. A final failure exits normally under every standard, ending the attempt.
- **Keep persisted state small under SCORM 1.2**: it shares the ~4 KB `suspend_data` budget with progress, bookmarks and saved answers. For a long or question-heavy course, export `scorm2004`, `cmi5` or `xapi` instead; validation warns when the page count alone nears the limit.
- **Under SCORM, a saved character outside ASCII costs 6 bytes** (an emoji 12). Count typed answers and `usePersistence` text in other scripts at that rate.
- **Saved question answers give way first.** When a save would exceed the `suspend_data` limit, answers are left out until it fits, and the console warns once. Scores, attempts, retries and locks still restore; the questions come back without the answer shown.
- **`scoring.passingScore` is the mastery score.** An LMS-supplied mastery score overrides it at launch under SCORM 1.2, SCORM 2004 and cmi5.
- **A package declares a pass mark** (`adlcp:masteryscore`, `minNormalizedMeasure`, cmi5 `masteryScore`) **only under `completion.mode: "quiz"` with a quiz verdict.** Anywhere else a `scoring.passingScore` you set still gates quiz pages that set `gatesProgress`, still decides the verdict, and scores are still reported, but the LMS gets no threshold of its own to judge them against.
- A failed `adapter.init()` renders a visible "This course can't run here" panel, never a silent degradation.

### Local testing

| Standard  | How to test                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| scorm12   | Upload the exported zip to [SCORM Cloud](https://cloud.scorm.com) (free) or Reload Player  |
| scorm2004 | SCORM Cloud (easiest); also Moodle, Cornerstone, SuccessFactors, Canvas                    |
| cmi5      | Upload the exported zip to SCORM Cloud and use its generated cmi5 dispatch URL             |
| xapi      | Upload the exported zip to SCORM Cloud (imports `tincan.xml`) and launch the generated URL |
| web       | Serve `dist/` from any static host                                                         |

Inspect the LMS API call log to confirm `lesson_status` / `completion_status` / interactions look right.
