import type { ResolvedConfig } from 'vite';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  readCourseConfig,
  resolveConfigRead,
  type CourseConfigRead,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import type { StandardId, StandardProfile } from '../runtime/standards.js';
import { reportValidationIssues, validateProject } from './validation.js';

export type ValidatedConfig = ResolvedConfigRead & {
  ok: true;
  profile: StandardProfile;
};

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
  #validatedConfig: ValidatedConfig | null = null;

  constructor(
    readonly standardOverride?: StandardId,
    private readonly configRead?: CourseConfigRead,
  ) {}

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

  validate(): void {
    this.#validatedConfig = null;
    const read = this.configRead ?? readCourseConfig(this.root);
    const result = validateProject(this.root, this.standardOverride, read);
    reportValidationIssues(result);
    if (result.errors.length > 0) {
      throw new Error(
        `Tessera validation failed with ${result.errors.length} error(s). Fix the errors above to continue.`,
      );
    }
    if (!this.isBuild) return;
    const resolved = resolveConfigRead(read, this.standardOverride);
    const { profile } = resolved;
    if (!resolved.ok || !profile) {
      throw new Error(
        '[tessera] course.config.js passed validation without a readable config and export standard.',
      );
    }
    this.#validatedConfig = { ...resolved, profile };
  }

  validatedConfig(): ValidatedConfig {
    if (!this.#validatedConfig) {
      throw new Error(
        '[tessera] course.config.js was read before validation ran.',
      );
    }
    return this.#validatedConfig;
  }

  readConfig(): ResolvedConfigRead {
    return this.isBuild
      ? this.validatedConfig()
      : resolveConfigRead(readCourseConfig(this.root), this.standardOverride);
  }
}
