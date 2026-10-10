import { startParseRun } from './ast.js';
import {
  readCourseConfig,
  READ_FAILURE_MESSAGES,
  type CourseConfigRead,
} from './manifest.js';
import type { StandardId } from '../runtime/standards.js';
import { applyA11ySettings, normalizeA11y } from './validation/a11y.js';
import {
  Diagnostics,
  type ValidationResult,
} from './validation/diagnostics.js';
import { parseConfig } from './validation/config.js';
import { crossValidate } from './validation/course.js';
import { validatePages, validateShells } from './validation/page.js';
import { readRuntimeXAPIHooks, validateXAPIConfig } from './validation/xapi.js';

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

/**
 * Validate a Tessera project at the given root.
 * Returns errors (block build) and warnings (informational).
 */
export function validateProject(
  projectRoot: string,
  standardOverride?: StandardId,
  read: CourseConfigRead = readCourseConfig(projectRoot),
): ValidationResult {
  startParseRun();
  const d = new Diagnostics();

  if (!read.ok && read.reason === 'missing') {
    d.error(`course.config.js: ${READ_FAILURE_MESSAGES.missing}`);
    return d;
  }
  const runtimeHooks = readRuntimeXAPIHooks(projectRoot, d);
  const { config, profile } = parseConfig(
    projectRoot,
    read,
    d,
    standardOverride,
  );
  if (config) validateXAPIConfig(config.xapi, profile, runtimeHooks, d);

  const pageResults = validatePages(projectRoot, d, profile);

  validateShells(projectRoot, d);

  if (config) {
    crossValidate(config, pageResults, d, profile);
  }

  applyA11ySettings(d, normalizeA11y(config?.a11y));
  return d;
}
