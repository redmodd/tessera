import { basename } from 'node:path';
import { validateProject, reportValidationIssues } from './validation.js';

export function runValidate(
  projectRoot: string,
  {
    showA11yTip = true,
    standardOverride,
  }: { showA11yTip?: boolean; standardOverride?: string } = {},
): number {
  const { errors, warnings } = validateProject(projectRoot, standardOverride);

  reportValidationIssues({ errors, warnings });

  if (errors.length > 0) {
    const summary =
      `Validation failed with ${errors.length} error(s)` +
      (warnings.length > 0 ? ` and ${warnings.length} warning(s)` : '') +
      '.';
    console.error(`\n\x1b[31m${summary}\x1b[0m`);
    return 1;
  }

  if (warnings.length > 0) {
    console.log(
      `\n\x1b[33mValidation passed with ${warnings.length} warning(s).\x1b[0m`,
    );
  } else {
    console.log(
      '\x1b[32m[tessera]\x1b[0m Validation passed — no issues found.',
    );
  }
  if (showA11yTip) {
    console.log(
      `\x1b[2m[tessera] Static checks only. For a full runtime accessibility audit, run: pnpm a11y ${basename(projectRoot)}\x1b[0m`,
    );
  }
  return 0;
}
