import type { ResolvedConfig } from 'vite';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  readResolvedConfig,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import { normalizeA11y } from './validation.js';
import type { StandardId } from '../runtime/standards.js';

/** True when `child` is `parent` or a path beneath it. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Build state shared by every plugin `tesseraPlugin()` returns. */
export class BuildContext {
  readonly standardOverride: StandardId | undefined;
  root = '';
  outDir = '';
  isBuild = false;
  manifest: Manifest | null = null;
  // Tier-1a state shared between the svelte() onwarn handler and the sibling
  // gate plugin. onwarn fires during transform (after the Tier-1b buildStart
  // gate), so a11y warnings are collected here and flushed/gated at buildEnd.
  a11yWarnings: string[] = [];
  a11ySettings = normalizeA11y(undefined);
  // Gates post-build side effects (asset copy, packaging) on a bundle that wrote
  // cleanly. Set from the enforce:'post' plugin, so a throw in an earlier
  // writeBundle leaves it closed.
  bundleWritten = false;

  constructor(standardOverride?: StandardId) {
    this.standardOverride = standardOverride;
  }

  configure(config: ResolvedConfig): void {
    this.root = config.root;
    this.outDir = resolve(config.root, config.build.outDir);
    this.isBuild = config.command === 'build';
    if (this.isBuild && isInside(this.outDir, this.root)) {
      throw new Error(
        `build.outDir (${this.outDir}) must not be or contain the project root.`,
      );
    }
    const read = this.readConfig();
    this.a11ySettings = normalizeA11y(read.ok ? read.config.a11y : undefined);
  }

  readConfig(): ResolvedConfigRead {
    return readResolvedConfig(this.root, this.standardOverride);
  }
}
