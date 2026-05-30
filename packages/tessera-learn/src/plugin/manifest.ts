import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import JSON5 from 'json5';
import {
  clearParseCache,
  defaultExportObjectLiteral,
  pageConfigLiteral,
} from './ast.js';
import type { CourseConfig, QuizConfig } from '../runtime/types.js';

// ---------- Types ----------

export type { QuizConfig };

export interface ManifestPage {
  index: number;
  title: string;
  slug: string;
  importPath: string;
  quiz: QuizConfig | null;
  completesOn?: 'view';
}

export interface ManifestLesson {
  title: string;
  slug: string;
  pages: ManifestPage[];
}

export interface ManifestSection {
  title: string;
  slug: string;
  lessons: ManifestLesson[];
}

export interface Manifest {
  sections: ManifestSection[];
  pages: ManifestPage[];
  totalPages: number;
}

/** Append `.svelte` if not already present. Both bare and suffixed names are accepted in author config. */
export function ensureSvelteSuffix(name: string): string {
  return name.endsWith('.svelte') ? name : `${name}.svelte`;
}

// ---------- File read cache ----------

/**
 * Module-level cache of source file contents keyed by absolute path with
 * mtime invalidation. Both `validateProject` and `generateManifest` read the
 * same .svelte / _meta.js / course.config.js files during a single build;
 * sharing the read avoids the second disk hit (and matters most on cold-cache
 * CI runs and large courses).
 */
const fileContentCache = new Map<
  string,
  { mtimeMs: number; content: string }
>();

export function readSourceFileCached(filePath: string): string {
  const stat = statSync(filePath);
  const cached = fileContentCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.content;
  const content = readFileSync(filePath, 'utf-8');
  fileContentCache.set(filePath, { mtimeMs: stat.mtimeMs, content });
  return content;
}

// ---------- Helpers ----------

/** Strip numeric prefix and hyphen: "01-introduction" → "introduction" */
export function stripPrefix(name: string): string {
  return name.replace(/^\d+-/, '');
}

/** Title-case a slug: "getting-started" → "Getting Started" */
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Derive slug from folder/file name */
export function deriveSlug(name: string, isFile = false): string {
  if (isFile) {
    return basename(name, extname(name));
  }
  return stripPrefix(name);
}

export type DefaultExportLiteralResult =
  | { kind: 'literal'; text: string }
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'parse-error' };

/**
 * Locate `export default { ... }` and return its object-literal text. Returns
 * a discriminated result so callers can tell parse failure from a missing or
 * non-literal default export. Used by both manifest extraction and project
 * validation.
 */
export function extractDefaultExportObjectLiteral(
  source: string,
): DefaultExportLiteralResult {
  return defaultExportObjectLiteral(source);
}

export type CourseConfigRead =
  | { ok: true; config: Partial<CourseConfig> }
  | {
      ok: false;
      reason: 'missing' | 'no-export' | 'parse-error';
      error?: unknown;
    };

/**
 * Read and JSON5-parse the `export default { ... }` literal from a project's
 * course.config.js. Shared by the build plugin and the validator so the read,
 * cache, and parse rules live in one place. The discriminated `reason` lets
 * callers that care (export, validation) emit precise errors while callers
 * that just need a value can fall back on `!ok`.
 */
export function readCourseConfig(projectRoot: string): CourseConfigRead {
  const configPath = resolve(projectRoot, 'course.config.js');
  if (!existsSync(configPath)) return { ok: false, reason: 'missing' };
  const result = extractDefaultExportObjectLiteral(
    readSourceFileCached(configPath),
  );
  if (result.kind === 'parse-error')
    return { ok: false, reason: 'parse-error' };
  if (result.kind !== 'literal') return { ok: false, reason: 'no-export' };
  try {
    return { ok: true, config: JSON5.parse(result.text) };
  } catch (error) {
    return { ok: false, reason: 'parse-error', error };
  }
}

/**
 * Read a _meta.js file and extract its default export object.
 * Uses the same JSON5 approach as pageConfig extraction — find the object literal
 * after `export default` and parse it.
 */
export function readMetaFile(metaPath: string): {
  title?: string;
  pages?: string[];
} {
  if (!existsSync(metaPath)) return {};

  const result = extractDefaultExportObjectLiteral(
    readSourceFileCached(metaPath),
  );
  if (result.kind !== 'literal') return {};

  try {
    return JSON5.parse(result.text);
  } catch {
    return {};
  }
}

/** Result of parsing a `.svelte` source for its `pageConfig` module-script export. */
export type PageConfigParseResult =
  /** No module script, or no `pageConfig =` export. Treat as "no config". */
  | { kind: 'none' }
  /** Found and successfully parsed. */
  | {
      kind: 'ok';
      value: { title?: string; quiz?: QuizConfig; completesOn?: 'view' };
    }
  /** Found but couldn't parse as a static object literal — non-literal RHS or JSON5 failure. */
  | { kind: 'invalid' };

/** Source-level pageConfig extraction shared by manifest generation and build-time validation. */
export function parsePageConfigFromSource(
  content: string,
): PageConfigParseResult {
  const literal = pageConfigLiteral(content);
  if (literal.kind === 'none') return { kind: 'none' };
  if (literal.kind === 'invalid') return { kind: 'invalid' };

  try {
    return { kind: 'ok', value: JSON5.parse(literal.text) };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Extract pageConfig from a .svelte file. Throws on parse failure. */
export function extractPageConfig(filePath: string): {
  title?: string;
  quiz?: QuizConfig;
  completesOn?: 'view';
} {
  const result = parsePageConfigFromSource(readSourceFileCached(filePath));
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'invalid') {
    throw new Error(
      `${filePath}: pageConfig must be a static object literal (no variables, function calls, or computed values)`,
    );
  }
  return {};
}

/**
 * Get sorted subdirectories of a given path.
 */
function getSortedDirs(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((name) => {
      const full = resolve(dirPath, name);
      return statSync(full).isDirectory() && !name.startsWith('.');
    })
    .sort();
}

/**
 * Get .svelte files in a directory.
 */
function getSvelteFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((name) => name.endsWith('.svelte'))
    .sort();
}

// ---------- Course structure walker ----------

export interface WalkedLesson {
  /** Lesson directory name, or null for a section's implicit flat lesson. */
  name: string | null;
  /** Directory holding the `.svelte` files (the section dir for a flat lesson). */
  dir: string;
  /** `_meta.js` path governing this lesson's title and page order. */
  metaPath: string;
  /** Sorted raw `.svelte` filenames in `dir` (pre-ordering). */
  files: string[];
}

export interface WalkedSection {
  name: string;
  dir: string;
  metaPath: string;
  lessons: WalkedLesson[];
}

/**
 * Enumerate the course's section → lesson → file structure. Section-level
 * `.svelte` files become an implicit flat lesson (`name: null`) ordered before
 * the section's explicit lesson directories. Shared by manifest generation and
 * build-time validation so the two never disagree on which files are pages.
 */
export function walkPages(pagesDir: string): WalkedSection[] {
  const sections: WalkedSection[] = [];
  for (const sectionName of getSortedDirs(pagesDir)) {
    const dir = resolve(pagesDir, sectionName);
    const metaPath = resolve(dir, '_meta.js');
    const lessons: WalkedLesson[] = [];

    const flatFiles = getSvelteFiles(dir);
    if (flatFiles.length > 0) {
      lessons.push({ name: null, dir, metaPath, files: flatFiles });
    }

    for (const lessonName of getSortedDirs(dir)) {
      const lessonDir = resolve(dir, lessonName);
      lessons.push({
        name: lessonName,
        dir: lessonDir,
        metaPath: resolve(lessonDir, '_meta.js'),
        files: getSvelteFiles(lessonDir),
      });
    }

    sections.push({ name: sectionName, dir, metaPath, lessons });
  }
  return sections;
}

// ---------- Main ----------

/**
 * Generate a course manifest by scanning the pages/ directory.
 */
export function generateManifest(pagesDir: string): Manifest {
  clearParseCache();
  const sections: ManifestSection[] = [];
  const flatPages: ManifestPage[] = [];
  let pageIndex = 0;

  for (const walkedSection of walkPages(pagesDir)) {
    const sectionMeta = readMetaFile(walkedSection.metaPath);
    const sectionSlug = deriveSlug(walkedSection.name);

    const section: ManifestSection = {
      title: sectionMeta.title || titleCase(sectionSlug),
      slug: sectionSlug,
      lessons: [],
    };

    for (const walkedLesson of walkedSection.lessons) {
      // The flat lesson uses the section _meta for ordering and has no title —
      // the sidebar renders its pages without a lesson header.
      const isFlat = walkedLesson.name === null;
      const lessonMeta = isFlat
        ? sectionMeta
        : readMetaFile(walkedLesson.metaPath);
      const lessonSlug = isFlat ? sectionSlug : deriveSlug(walkedLesson.name!);
      const relDir = isFlat
        ? `/pages/${walkedSection.name}`
        : `/pages/${walkedSection.name}/${walkedLesson.name}`;

      const lesson: ManifestLesson = {
        title: isFlat ? '' : lessonMeta.title || titleCase(lessonSlug),
        slug: lessonSlug,
        pages: [],
      };

      for (const fileName of orderPageFiles(
        walkedLesson.files,
        lessonMeta.pages,
      )) {
        const filePath = resolve(walkedLesson.dir, fileName);
        const pageSlug = deriveSlug(fileName, true);

        let pageConfig: {
          title?: string;
          quiz?: QuizConfig;
          completesOn?: 'view';
        } = {};
        try {
          pageConfig = extractPageConfig(filePath);
        } catch (e) {
          // Validation errors will be handled by the validation plugin (Step 11).
          // For now, log and continue with defaults.
          console.warn(`[tessera warning] ${(e as Error).message}`);
        }

        const page: ManifestPage = {
          index: pageIndex,
          title: pageConfig.title || titleCase(pageSlug),
          slug: pageSlug,
          importPath: `${relDir}/${fileName}`,
          quiz: pageConfig.quiz || null,
          ...(pageConfig.completesOn === 'view'
            ? { completesOn: 'view' as const }
            : {}),
        };

        lesson.pages.push(page);
        flatPages.push(page);
        pageIndex++;
      }

      section.lessons.push(lesson);
    }

    sections.push(section);
  }

  return {
    sections,
    pages: flatPages,
    totalPages: flatPages.length,
  };
}

/**
 * Order .svelte files: listed in `pages` array first (in order), then unlisted appended alphabetically.
 */
export function orderPageFiles(
  allFiles: string[],
  pagesArray?: string[],
): string[] {
  if (!pagesArray || pagesArray.length === 0) {
    return allFiles;
  }

  const listed = pagesArray.map(ensureSvelteSuffix);
  const listedSet = new Set(listed);
  const unlisted = allFiles.filter((f) => !listedSet.has(f)).sort();

  // Only include listed files that actually exist
  const validListed = listed.filter((f) => allFiles.includes(f));

  return [...validListed, ...unlisted];
}
