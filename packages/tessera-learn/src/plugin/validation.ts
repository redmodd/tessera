import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { dropUnreadParses } from './ast.js';
import {
  COURSE_CONFIG_FILE,
  pageSourcePaths,
  readCourseConfig,
  READ_FAILURE_MESSAGES,
  walkPages,
  type CourseConfigRead,
} from './manifest.js';
import type { StandardId } from '../runtime/standards.js';
import {
  applyA11ySettings,
  dropA11yDiagnostics,
  normalizeA11y,
} from './validation/a11y.js';
import {
  Diagnostics,
  type ValidationResult,
} from './validation/diagnostics.js';
import { parseConfig } from './validation/config.js';
import { crossValidate } from './validation/course.js';
import {
  SHELL_FILES,
  validatePages,
  validateShells,
} from './validation/page.js';
import {
  COURSE_RUNTIME_FILE,
  readRuntimeXAPIHooks,
  validateXAPIConfig,
} from './validation/xapi.js';

/** Print notes (cyan), then warnings (yellow), then errors (red). Shared by the dev/build plugin and the CLI. */
export function reportValidationIssues({
  errors,
  warnings,
  infos = [],
}: ValidationResult): void {
  for (const info of infos) {
    console.log(`\x1b[36m[tessera]\x1b[0m ${info}`);
  }
  for (const warning of warnings) {
    console.warn(`\x1b[33m[tessera warning]\x1b[0m ${warning}`);
  }
  for (const error of errors) {
    console.error(`\x1b[31m[tessera error]\x1b[0m ${error}`);
  }
}

/** The files `validateProject` reads from the project root, beside the pages. */
export const VALIDATED_ROOT_FILES = [
  COURSE_CONFIG_FILE,
  COURSE_RUNTIME_FILE,
  ...SHELL_FILES,
];

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * The content of each file `validateProject` looks at and a build then reads
 * again, by project-relative path. A section or lesson folder is listed with a
 * trailing separator and no content, so an empty one counts.
 * course.config.js is left out: a build keeps the read it validated.
 */
export function readValidatedSources(projectRoot: string): Map<string, string> {
  const pagesDir = resolve(projectRoot, 'pages');
  const { sections, strayFiles } = walkPages(pagesDir);
  const sources = new Map<string, string>();
  for (const { dir } of sections.flatMap((s) => [s, ...s.lessons])) {
    sources.set(relative(projectRoot, dir) + sep, '');
  }
  const files = [
    ...VALIDATED_ROOT_FILES.filter((file) => file !== COURSE_CONFIG_FILE).map(
      (file) => resolve(projectRoot, file),
    ),
    ...strayFiles.map((file) => resolve(pagesDir, file)),
    ...pageSourcePaths(sections),
  ];
  for (const path of files) {
    const source = readIfPresent(path);
    if (source !== undefined) sources.set(relative(projectRoot, path), source);
  }
  return sources;
}

/**
 * Validate a Tessera project at the given root.
 * Returns errors (block build) and warnings (informational).
 */
export function validateProject(
  projectRoot: string,
  standardOverride?: StandardId,
  read: CourseConfigRead = readCourseConfig(projectRoot),
): Diagnostics {
  const d = new Diagnostics();
  d.partial = !read.ok;

  if (!read.ok && read.reason === 'missing') {
    d.error(`course.config.js: ${READ_FAILURE_MESSAGES.missing}`);
    return d;
  }
  const runtimeHooks = readRuntimeXAPIHooks(projectRoot, d);
  const { config, profile } = d.within(COURSE_CONFIG_FILE, () => {
    const parsed = parseConfig(projectRoot, read, d, standardOverride);
    if (parsed.config) {
      validateXAPIConfig(parsed.config.xapi, parsed.profile, runtimeHooks, d);
    }
    return parsed;
  });

  const pageResults = validatePages(projectRoot, d, profile);
  d.courseChecksSkipped = pageResults.hasParseErrors;

  validateShells(projectRoot, d);

  if (config) {
    crossValidate(config, pageResults, d, profile);
  }

  if (config) applyA11ySettings(d, normalizeA11y(config.a11y));
  else dropA11yDiagnostics(d);
  dropUnreadParses();
  return d;
}
