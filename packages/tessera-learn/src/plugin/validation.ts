import { startParseRun } from './ast.js';
import {
  COURSE_CONFIG_FILE,
  readCourseConfig,
  READ_FAILURE_MESSAGES,
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

/**
 * Validate a Tessera project at the given root.
 * Returns errors (block build) and warnings (informational).
 */
export function validateProject(
  projectRoot: string,
  standardOverride?: StandardId,
  read: CourseConfigRead = readCourseConfig(projectRoot),
): Diagnostics {
  startParseRun();
  const d = new Diagnostics();
  d.partial = !read.ok;

  if (!read.ok && read.reason === 'missing') {
    d.error(`course.config.js: ${READ_FAILURE_MESSAGES.missing}`);
    return d;
  }
  const runtimeHooks = readRuntimeXAPIHooks(projectRoot, d);
  const { config, profile } = d.within(COURSE_CONFIG_FILE, () =>
    parseConfig(projectRoot, read, d, standardOverride),
  );
  if (config) validateXAPIConfig(config.xapi, profile, runtimeHooks, d);

  const pageResults = validatePages(projectRoot, d, profile);

  validateShells(projectRoot, d);

  if (config) {
    crossValidate(config, pageResults, d, profile);
  }

  if (config) applyA11ySettings(d, normalizeA11y(config.a11y));
  else dropA11yDiagnostics(d);
  return d;
}
