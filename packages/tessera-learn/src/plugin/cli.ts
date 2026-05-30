#!/usr/bin/env node
import { realpathSync } from 'node:fs';
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
    case 'check': {
      if (rest.includes('--help') || rest.includes('-h')) {
        console.log(USAGE);
        return 0;
      }
      if (sub === 'check') {
        const validateCode = runValidate(process.cwd());
        if (validateCode !== 0) return validateCode;
      }
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

// argv[1] is realpath'd to match Node's already-resolved import.meta.url, so the
// guard still fires when invoked through a symlink (pnpm/npm bin shims).
export function isMainEntry(
  metaUrl: string,
  entry: string | undefined,
): boolean {
  if (!entry) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isMainEntry(import.meta.url, process.argv[1])) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
