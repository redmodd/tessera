#!/usr/bin/env node
import { validateProject, reportValidationIssues } from './validation.js';

const projectRoot = process.cwd();
const { errors, warnings } = validateProject(projectRoot);

reportValidationIssues({ errors, warnings });

if (errors.length > 0) {
  const summary =
    `Validation failed with ${errors.length} error(s)` +
    (warnings.length > 0 ? ` and ${warnings.length} warning(s)` : '') +
    '.';
  console.error(`\n\x1b[31m${summary}\x1b[0m`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(
    `\n\x1b[33mValidation passed with ${warnings.length} warning(s).\x1b[0m`
  );
} else {
  console.log('\x1b[32m[tessera]\x1b[0m Validation passed — no issues found.');
}
process.exit(0);
