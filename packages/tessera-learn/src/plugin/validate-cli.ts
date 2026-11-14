import { basename } from 'node:path';
import { styleText } from 'node:util';
import { validateProject, reportValidationIssues } from './validation.js';
import type { StandardId } from '../runtime/standards.js';

export function runValidate(
  projectRoot: string,
  {
    showA11yTip = true,
    standardOverride,
  }: { showA11yTip?: boolean; standardOverride?: StandardId } = {},
): number {
  const result = validateProject(projectRoot, standardOverride);
  const { errors, warnings } = result;
  reportValidationIssues(result);

  if (errors.length > 0) {
    const summary =
      `Validation failed with ${errors.length} error(s)` +
      (warnings.length > 0 ? ` and ${warnings.length} warning(s)` : '') +
      '.';
    console.error(`\n${styleText('red', summary, { stream: process.stderr })}`);
    return 1;
  }

  if (warnings.length > 0) {
    console.log(
      `\n${styleText('yellow', `Validation passed with ${warnings.length} warning(s).`)}`,
    );
  } else {
    console.log(
      `${styleText('green', '[tessera]')} Validation passed with no issues.`,
    );
  }
  if (showA11yTip) {
    console.log(
      styleText(
        'dim',
        `[tessera] Static checks only. For a full runtime accessibility audit, run: pnpm a11y ${basename(projectRoot)}`,
      ),
    );
  }
  return 0;
}
