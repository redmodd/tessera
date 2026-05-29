#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runValidate } from './validate-cli.js';
import { runA11y } from './a11y-cli.js';

const USAGE = `Usage: tessera <command> [options]

Commands:
  validate            Fast static structure checks
  a11y [options]      Runtime accessibility audit (builds + drives Playwright)
  check [options]     Run validate, then a11y

a11y/check options:
  --threshold <minor|moderate|serious|critical>   Failing impact (default: serious)
  --build                                          Force a fresh build first`;

export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'validate':
      return runValidate(process.cwd());
    case 'a11y':
      return runA11y(rest);
    case 'check': {
      const validateCode = runValidate(process.cwd());
      if (validateCode !== 0) return validateCode;
      return runA11y(rest);
    }
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;
    case undefined:
      console.error(`No command given.\n\n${USAGE}`);
      return 1;
    default:
      console.error(`Unknown command: ${sub}\n\n${USAGE}`);
      return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
