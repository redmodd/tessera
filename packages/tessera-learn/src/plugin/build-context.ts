import type { ResolvedConfig } from 'vite';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  readCourseConfig,
  resolveConfigRead,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import type { StandardId } from '../runtime/standards.js';

export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// Svelte's onwarn filename is relative to process.cwd() (Svelte's default
// rootDir) when the file sits under it, and absolute otherwise; Rollup log ids
// are absolute. Return the project-relative path for a real author file, or
// null to skip framework, node_modules and virtual modules. Tier 0 owns the
// framework's own warnings.
export function projectFileRel(
  filename: string | undefined,
  projectRoot: string,
): string | null {
  if (!filename || filename.startsWith('\0')) return null;
  const abs = resolve(filename);
  if (!isInside(projectRoot, abs)) return null;
  if (filename.startsWith('virtual:') && !existsSync(abs)) return null;
  const rel = relative(projectRoot, abs);
  return rel.split(sep).includes('node_modules') ? null : rel;
}

export class BuildContext {
  root = '';
  outDir = '';
  isBuild = false;
  manifest: Manifest | null = null;
  // Tier-1a state shared between the svelte() onwarn handler and the sibling
  // gate plugin. onwarn fires during transform (after the Tier-1b buildStart
  // gate), so a11y warnings are collected here and flushed/gated at buildEnd.
  a11yWarnings: string[] = [];

  constructor(readonly standardOverride?: StandardId) {}

  configure(config: ResolvedConfig): void {
    this.root = config.root;
    this.outDir = resolve(config.root, config.build.outDir);
    this.isBuild = config.command === 'build';
    if (this.isBuild && isInside(this.outDir, this.root)) {
      throw new Error(
        `build.outDir (${this.outDir}) must not be or contain the project root.`,
      );
    }
  }

  readConfig(): ResolvedConfigRead {
    return resolveConfigRead(
      readCourseConfig(this.root),
      this.standardOverride,
    );
  }
}
