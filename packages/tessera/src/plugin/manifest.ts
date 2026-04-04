import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import JSON5 from 'json5';

// ---------- Types ----------

export interface ManifestPage {
  index: number;
  title: string;
  slug: string;
  importPath: string;
  quiz: QuizConfig | null;
}

export interface QuizConfig {
  graded?: boolean;
  gatesProgress?: boolean;
  maxAttempts?: number;
  showFeedback?: boolean;
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

/**
 * Read a _meta.js file and extract its default export object.
 * Uses the same JSON5 approach as pageConfig extraction — find the object literal
 * after `export default` and parse it.
 */
export function readMetaFile(metaPath: string): { title?: string; pages?: string[] } {
  if (!existsSync(metaPath)) return {};

  const content = readFileSync(metaPath, 'utf-8');

  // Find `export default {`
  const match = content.match(/export\s+default\s*(\{)/);
  if (!match || match.index === undefined) return {};

  const startIndex = content.indexOf('{', match.index);
  const objectStr = extractObjectLiteral(content, startIndex);
  if (!objectStr) return {};

  try {
    return JSON5.parse(objectStr);
  } catch {
    return {};
  }
}

/**
 * Extract pageConfig from a .svelte file's <script context="module"> block.
 */
export function extractPageConfig(filePath: string): { title?: string; quiz?: QuizConfig } {
  const content = readFileSync(filePath, 'utf-8');

  // Extract <script context="module"> block
  const moduleScriptMatch = content.match(
    /<script\s+context\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!moduleScriptMatch) return {};

  const scriptContent = moduleScriptMatch[1];

  // Find `export const pageConfig =`
  const configMatch = scriptContent.match(/export\s+const\s+pageConfig\s*=\s*(\{)/);
  if (!configMatch || configMatch.index === undefined) return {};

  const startIndex = scriptContent.indexOf('{', configMatch.index);
  const objectStr = extractObjectLiteral(scriptContent, startIndex);
  if (!objectStr) return {};

  try {
    return JSON5.parse(objectStr);
  } catch {
    throw new Error(
      `${filePath}: pageConfig must be a static object literal (no variables, function calls, or computed values)`
    );
  }
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

        let pageConfig: { title?: string; quiz?: QuizConfig } = {};
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

  const listed = pagesArray.map(name => name.endsWith('.svelte') ? name : `${name}.svelte`);
  const listedSet = new Set(listed);
  const unlisted = allFiles.filter(f => !listedSet.has(f)).sort();

  // Only include listed files that actually exist
  const validListed = listed.filter(f => allFiles.includes(f));

  return [...validListed, ...unlisted];
}
