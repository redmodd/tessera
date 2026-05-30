#!/usr/bin/env node
import { runValidate } from './validate-cli.js';
import { runA11y } from './a11y-cli.js';

const USAGE = `Usage: tessera <command> [options]

Commands:
  dev                 Start the Vite dev server
  export              Build and package the course for its LMS standard
  validate            Fast static structure checks
  a11y [options]      Runtime accessibility audit (builds + drives Playwright)
  check [options]     Run validate, then a11y

a11y/check options:
  --threshold <minor|moderate|serious|critical>   Failing impact (default: serious)
  --build                                          Force a fresh build first`;

export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'dev': {
      const { runDev } = await import('./build-commands.js');
      return runDev(process.cwd());
    }
    case 'export': {
      const { runBuild } = await import('./build-commands.js');
      return runBuild(process.cwd());
    }
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

// import.meta.main is true only when this module is the program entry point,
// and resolves symlinks itself (pnpm/npm bin shims) — Node >= 24.
if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
