import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import JSON5 from 'json5';
import type { QuizConfig } from '../runtime/types.js';

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
const fileContentCache = new Map<string, { mtimeMs: number; content: string }>();

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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Derive slug from folder/file name */
export function deriveSlug(name: string, isFile = false): string {
  if (isFile) {
    return basename(name, extname(name));
  }
  return stripPrefix(name);
}

/** Matches both Svelte 5 `<script module>` and legacy `<script context="module">`. */
export const MODULE_SCRIPT_RE =
  /<script\s+(?:context\s*=\s*["']module["']|module)[^>]*>([\s\S]*?)<\/script>/;

/** Matches `export const pageConfig =` (RHS is read separately). */
export const PAGE_CONFIG_EXPORT_RE = /export\s+const\s+pageConfig\s*=\s*/;

/** Matches `export default ` (RHS is read separately). */
const DEFAULT_EXPORT_RE = /export\s+default\s*/;

/**
 * Locate `export default { ... }` and return the object literal substring,
 * or null if no balanced object literal follows the `export default` keyword.
 * Used by both manifest extraction and project validation.
 */
export function extractDefaultExportObjectLiteral(source: string): string | null {
  const match = source.match(DEFAULT_EXPORT_RE);
  if (!match || match.index === undefined) return null;
  const startIndex = source.indexOf('{', match.index);
  if (startIndex < 0) return null;
  return extractObjectLiteral(source, startIndex);
}

/**
 * Read a _meta.js file and extract its default export object.
 * Uses the same JSON5 approach as pageConfig extraction — find the object literal
 * after `export default` and parse it.
 */
export function readMetaFile(metaPath: string): { title?: string; pages?: string[] } {
  if (!existsSync(metaPath)) return {};

  const objectStr = extractDefaultExportObjectLiteral(readSourceFileCached(metaPath));
  if (!objectStr) return {};

  try {
    return JSON5.parse(objectStr);
  } catch {
    return {};
  }
}

/** Result of parsing a `.svelte` source for its `pageConfig` module-script export. */
export type PageConfigParseResult =
  /** No module script, or no `pageConfig =` export. Treat as "no config". */
  | { kind: 'none' }
  /** Found and successfully parsed. */
  | { kind: 'ok'; value: { title?: string; quiz?: QuizConfig; completesOn?: 'view' } }
  /** Found but couldn't parse as a static object literal — non-literal RHS or JSON5 failure. */
  | { kind: 'invalid' };

/** Source-level pageConfig extraction shared by manifest generation and build-time validation. */
export function parsePageConfigFromSource(content: string): PageConfigParseResult {
  const moduleScriptMatch = content.match(MODULE_SCRIPT_RE);
  if (!moduleScriptMatch) return { kind: 'none' };

  const scriptContent = moduleScriptMatch[1];

  const configMatch = scriptContent.match(PAGE_CONFIG_EXPORT_RE);
  if (!configMatch || configMatch.index === undefined) return { kind: 'none' };

  const afterExport = scriptContent
    .slice(configMatch.index + configMatch[0].length)
    .trimStart();
  // pageConfig assigned to something other than an object literal — flag as invalid.
  if (!afterExport.startsWith('{')) return { kind: 'invalid' };

  const startIndex = scriptContent.indexOf('{', configMatch.index + configMatch[0].length);
  if (startIndex < 0) return { kind: 'invalid' };
  const objectStr = extractObjectLiteral(scriptContent, startIndex);
  if (!objectStr) return { kind: 'invalid' };

  try {
    return { kind: 'ok', value: JSON5.parse(objectStr) };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Extract pageConfig from a .svelte file. Throws on parse failure. */
export function extractPageConfig(filePath: string): { title?: string; quiz?: QuizConfig; completesOn?: 'view' } {
  const result = parsePageConfigFromSource(readSourceFileCached(filePath));
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'invalid') {
    throw new Error(
      `${filePath}: pageConfig must be a static object literal (no variables, function calls, or computed values)`
    );
  }
  return {};
}

/**
 * Extract an object literal from source starting at the opening brace.
 * Tracks brace depth to find the matching closing brace.
 */
export function extractObjectLiteral(source: string, startIndex: number): string | null {
  if (source[startIndex] !== '{') return null;

  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    // Skip single-line comments
    if (char === '/' && i + 1 < source.length && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i);
      i = newline === -1 ? source.length : newline;
      continue;
    }

    // Skip multi-line comments
    if (char === '/' && i + 1 < source.length && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Get sorted subdirectories of a given path.
 */
function getSortedDirs(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter(name => {
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
    .filter(name => name.endsWith('.svelte'))
    .sort();
}

// ---------- Main ----------

/**
 * Generate a course manifest by scanning the pages/ directory.
 */
export function generateManifest(pagesDir: string): Manifest {
  const sections: ManifestSection[] = [];
  const flatPages: ManifestPage[] = [];
  let pageIndex = 0;

  const sectionDirs = getSortedDirs(pagesDir);

  for (const sectionName of sectionDirs) {
    const sectionPath = resolve(pagesDir, sectionName);
    const sectionMeta = readMetaFile(resolve(sectionPath, '_meta.js'));
    const sectionSlug = deriveSlug(sectionName);

    const section: ManifestSection = {
      title: sectionMeta.title || titleCase(sectionSlug),
      slug: sectionSlug,
      lessons: [],
    };

    const lessonDirs = getSortedDirs(sectionPath);

    for (const lessonName of lessonDirs) {
      const lessonPath = resolve(sectionPath, lessonName);
      const lessonMeta = readMetaFile(resolve(lessonPath, '_meta.js'));
      const lessonSlug = deriveSlug(lessonName);

      const lesson: ManifestLesson = {
        title: lessonMeta.title || titleCase(lessonSlug),
        slug: lessonSlug,
        pages: [],
      };

      // Determine page order
      const allSvelteFiles = getSvelteFiles(lessonPath);
      const orderedFiles = orderPageFiles(allSvelteFiles, lessonMeta.pages);

      for (const fileName of orderedFiles) {
        const filePath = resolve(lessonPath, fileName);
        const pageSlug = deriveSlug(fileName, true);

        let pageConfig: { title?: string; quiz?: QuizConfig; completesOn?: 'view' } = {};
        try {
          pageConfig = extractPageConfig(filePath);
        } catch (e) {
          // Validation errors will be handled by the validation plugin (Step 11).
          // For now, log and continue with defaults.
          console.warn(`[tessera warning] ${(e as Error).message}`);
        }

        const relativePath = `/pages/${sectionName}/${lessonName}/${fileName}`;

        const page: ManifestPage = {
          index: pageIndex,
          title: pageConfig.title || titleCase(pageSlug),
          slug: pageSlug,
          importPath: relativePath,
          quiz: pageConfig.quiz || null,
          ...(pageConfig.completesOn ? { completesOn: pageConfig.completesOn } : {}),
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
export function orderPageFiles(allFiles: string[], pagesArray?: string[]): string[] {
  if (!pagesArray || pagesArray.length === 0) {
    return allFiles;
  }

  const listed = pagesArray.map(ensureSvelteSuffix);
  const listedSet = new Set(listed);
  const unlisted = allFiles.filter(f => !listedSet.has(f)).sort();

  // Only include listed files that actually exist
  const validListed = listed.filter(f => allFiles.includes(f));

  return [...validListed, ...unlisted];
}
