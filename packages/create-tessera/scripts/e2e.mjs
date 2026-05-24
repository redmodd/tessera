// End-to-end check: scaffold each template, install the *local* tessera-learn,
// then validate and build it under every export standard, asserting each one
// produces output. This is what proves the on-disk templates are real,
// installable, validatable, buildable projects — not just text.
//
// tessera-learn is packed from this repo and installed over the scaffolded
// `^0.0.x` pin, so the e2e validates the in-repo framework regardless of what is
// published (and works on an unpublished version bump). pnpm 10 no longer links
// workspace packages across a semver range by default, which is why we pack.
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const CLI = join(PKG_ROOT, 'dist', 'index.js');
const TEMPLATES = ['default', 'bare'];
// Every export target. Packaged standards (all but web) write a manifest into
// dist/ and a zip into the project root; web just emits the static dist/.
const STANDARDS = ['web', 'scorm12', 'scorm2004', 'cmi5'];
const MANIFEST = {
  scorm12: 'imsmanifest.xml',
  scorm2004: 'imsmanifest.xml',
  cmi5: 'cmi5.xml',
};

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}\n  (cwd: ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// Rewrite export.standard in the scaffolded course.config.js — the only place
// the build reads it from (there is no env/flag override).
function setStandard(projectDir, standard) {
  const cfg = join(projectDir, 'course.config.js');
  const src = readFileSync(cfg, 'utf-8');
  const re = /standard:\s*["'][^"']*["']/;
  if (!re.test(src)) {
    throw new Error(`could not find export.standard in ${cfg}`);
  }
  writeFileSync(cfg, src.replace(re, `standard: '${standard}'`));
}

function assertExport(projectDir, template, standard) {
  const dist = join(projectDir, 'dist');
  if (!existsSync(dist) || readdirSync(dist).length === 0) {
    throw new Error(
      `[${template}/${standard}] expected non-empty dist/ after export`,
    );
  }
  if (standard === 'web') return;
  if (!existsSync(join(dist, MANIFEST[standard]))) {
    throw new Error(
      `[${template}/${standard}] expected ${MANIFEST[standard]} in dist/`,
    );
  }
  if (!readdirSync(projectDir).some((f) => f.endsWith('.zip'))) {
    throw new Error(
      `[${template}/${standard}] expected a packaged .zip in the project root`,
    );
  }
}

// Build the CLI and the framework, then pack the framework to a temp dir.
run('pnpm --filter create-tessera build', REPO_ROOT);
run('pnpm --filter tessera-learn build', REPO_ROOT);

const packDir = mkdtempSync(join(tmpdir(), 'tessera-pack-'));
run(
  `pnpm --filter tessera-learn pack --pack-destination "${packDir}"`,
  REPO_ROOT,
);
const tgz = readdirSync(packDir).find((f) => /^tessera-learn-.*\.tgz$/.test(f));
if (!tgz) {
  throw new Error(`no tessera-learn tarball produced in ${packDir}`);
}
const tarball = join(packDir, tgz);
console.log(`\nLocal tessera-learn tarball: ${tarball}`);

for (const template of TEMPLATES) {
  const work = mkdtempSync(join(tmpdir(), `tessera-e2e-${template}-`));
  const name = `${template}-course`;
  const projectDir = join(work, name);

  run(`node "${CLI}" ${name} --template=${template}`, work);
  // Installs the tarball as tessera-learn (overriding the registry pin) plus the
  // registry devDeps in one shot.
  run(`npm install "${tarball}"`, projectDir);

  for (const standard of STANDARDS) {
    setStandard(projectDir, standard);
    run('npm run validate', projectDir);
    run('npm run export', projectDir);
    assertExport(projectDir, template, standard);
    console.log(`\n✓ ${template}/${standard}: validated and built`);
  }
}

console.log(
  '\nAll templates validated and built across every export standard.',
);
