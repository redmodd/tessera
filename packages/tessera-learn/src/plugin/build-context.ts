import type { ResolvedConfig } from 'vite';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  readResolvedConfig,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import type { StandardId } from '../runtime/standards.js';

export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
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
    return readResolvedConfig(this.root, this.standardOverride);
  }
}
