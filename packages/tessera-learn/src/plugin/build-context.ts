import type { ResolvedConfig } from 'vite';
import { resolve } from 'node:path';
import {
  readResolvedConfig,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import { normalizeA11y } from './validation.js';
import { standardProfile, type StandardId } from '../runtime/standards.js';

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
  a11y = { warnings: [] as string[], settings: normalizeA11y(undefined) };
  // Gates post-build side effects (asset copy, packaging) on a bundle that wrote
  // cleanly. Set from the enforce:'post' plugin, so a throw in an earlier
  // writeBundle leaves it closed.
  bundleWritten = false;

  constructor(standardOverride?: StandardId) {
    this.standardOverride = standardOverride;
  }

  resolve(config: ResolvedConfig): void {
    this.root = config.root;
    this.outDir = resolve(config.root, config.build.outDir);
    this.isBuild = config.command === 'build';
  }

  get config(): ResolvedConfigRead {
    return readResolvedConfig(this.root, this.standardOverride);
  }

  get profile() {
    return standardProfile(this.config.standard);
  }
}
