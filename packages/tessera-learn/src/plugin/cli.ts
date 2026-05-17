#!/usr/bin/env node
import { validateProject } from './validation.js';

const projectRoot = process.cwd();
const { errors, warnings } = validateProject(projectRoot);

for (const warning of warnings) {
  console.warn(`\x1b[33m[tessera warning]\x1b[0m ${warning}`);
}
for (const error of errors) {
  console.error(`\x1b[31m[tessera error]\x1b[0m ${error}`);
}

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
