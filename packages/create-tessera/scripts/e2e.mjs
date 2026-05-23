// End-to-end check: scaffold each template, install the *local* tessera-learn,
// build the project, and assert it produces output. This is what proves the
// on-disk templates are real, installable, buildable projects — not just text.
//
// tessera-learn is packed from this repo and installed over the scaffolded
// `^0.0.x` pin, so the e2e validates the in-repo framework regardless of what is
// published (and works on an unpublished version bump). pnpm 10 no longer links
// workspace packages across a semver range by default, which is why we pack.
import { execSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');
const CLI = join(PKG_ROOT, 'dist', 'index.js');
const TEMPLATES = ['default', 'bare'];

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}\n  (cwd: ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// Build the CLI and the framework, then pack the framework to a temp dir.
run('pnpm --filter create-tessera build', REPO_ROOT);
run('pnpm --filter tessera-learn build', REPO_ROOT);

const packDir = mkdtempSync(join(tmpdir(), 'tessera-pack-'));
run(`pnpm --filter tessera-learn pack --pack-destination ${packDir}`, REPO_ROOT);
const tarball = join(
  packDir,
  readdirSync(packDir).find((f) => /^tessera-learn-.*\.tgz$/.test(f))
);
console.log(`\nLocal tessera-learn tarball: ${tarball}`);

for (const template of TEMPLATES) {
  const work = mkdtempSync(join(tmpdir(), `tessera-e2e-${template}-`));
  const name = `${template}-course`;
  const projectDir = join(work, name);

  run(`node ${CLI} ${name} --template=${template}`, work);
  // Installs the tarball as tessera-learn (overriding the registry pin) plus the
  // registry devDeps in one shot, then builds via the project's export script.
  run(`npm install ${tarball}`, projectDir);
  run('npm run export', projectDir);

  const dist = join(projectDir, 'dist');
  if (!existsSync(dist) || readdirSync(dist).length === 0) {
    throw new Error(`[${template}] expected non-empty dist/ after "npm run export"`);
  }
  console.log(`\n✓ ${template}: scaffolded, installed, and built (${dist})`);
}

console.log('\nAll templates scaffolded, installed, and built successfully.');
