import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, relative, isAbsolute } from 'node:path';
import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  cpSync,
  mkdirSync,
} from 'node:fs';
import { generateManifest, readCourseConfig } from './manifest.js';
import type { Manifest } from './manifest.js';
import type { CourseConfig } from '../runtime/types.js';
import {
  DEFAULT_PASSING_SCORE,
  DEFAULT_PERCENTAGE_THRESHOLD,
} from '../runtime/defaults.js';
import {
  validateProject,
  reportValidationIssues,
  normalizeA11y,
  isPlausibleLanguageTag,
  isIgnored,
  type A11ySettings,
} from './validation.js';
import { runExport } from './export.js';
import { tesseraLayoutPlugin } from './layout.js';
import { tesseraQuizPlugin } from './quiz.js';
import { resolvePackageRoot } from './package-root.js';

import { AUDIT_ENV_FLAG } from './a11y/audit.js';

export { runAudit } from './a11y/audit.js';
export type { AuditOptions, ImpactLevel } from './a11y/audit.js';

function isAuditBuild(): boolean {
  return process.env[AUDIT_ENV_FLAG] === '1';
}

// Resolve the runtime directory where App.svelte lives
function resolveRuntimeDir(): string {
  return resolve(resolvePackageRoot(), 'src', 'runtime');
}

// Resolve the framework styles directory
function resolveStylesDir(): string {
  return resolve(resolvePackageRoot(), 'styles');
}

// Tier-1a state shared between the svelte() onwarn handler and the sibling
// gate plugin. onwarn fires during transform (after the Tier-1b buildStart
// gate), so a11y warnings are collected here and flushed/gated at buildEnd.
interface A11yCompilerState {
  warnings: string[];
  projectRoot: string;
  isBuild: boolean;
  settings: A11ySettings;
}

// Svelte's onwarn filename is relative to the vite root (e.g. `pages/x.svelte`)
// in build and may be absolute or a virtual id elsewhere. Return the
// project-relative path for a real author file, or null to skip framework /
// node_modules / virtual modules — Tier 0 owns the framework's own warnings.
function projectFileRel(
  filename: string | undefined,
  projectRoot: string,
): string | null {
  if (!filename || !projectRoot) return null;
  if (
    filename.startsWith('\0') ||
    filename.includes('virtual:') ||
    filename.includes('node_modules')
  ) {
    return null;
  }
  const abs = isAbsolute(filename) ? filename : resolve(projectRoot, filename);
  const rel = relative(projectRoot, abs);
  if (rel.startsWith('..') || isAbsolute(rel) || rel.includes('node_modules')) {
    return null;
  }
  return rel;
}

export function tesseraPlugin() {
  const manifestRef: { current: Manifest | null; root: string } = {
    current: null,
    root: '',
  };
  const a11y: A11yCompilerState = {
    warnings: [],
    projectRoot: '',
    isBuild: false,
    settings: normalizeA11y(undefined),
  };
  return [
    svelte({
      compilerOptions: { css: 'external' },
      onwarn(warning, defaultHandler) {
        if (warning.code?.startsWith('a11y')) {
          const rel = projectFileRel(warning.filename, a11y.projectRoot);
          if (rel !== null) {
            const msg = `[${warning.code}] ${rel}: ${warning.message}`;
            if (a11y.isBuild) {
              a11y.warnings.push(msg);
            } else if (!a11y.settings.ignore.includes(warning.code)) {
              reportValidationIssues({ errors: [], warnings: [msg] });
            }
          }
          return; // suppress the raw Vite print; we re-emit via the reporter
        }
        defaultHandler?.(warning);
      },
    }),
    tesseraA11yCompilerPlugin(a11y),
    tesseraValidationPlugin(),
    tesseraEntryPlugin(),
    tesseraConfigPlugin(),
    tesseraPagesPlugin(),
    tesseraManifestPlugin(manifestRef),
    tesseraLayoutPlugin(),
    tesseraQuizPlugin(),
    tesseraAdapterPlugin(),
    tesseraXAPISetupPlugin(),
    tesseraFirstPagePreloadPlugin(manifestRef),
    tesseraExportPlugin(),
  ];
}

// ---------- Entry Plugin ----------

const VIRTUAL_ENTRY_ID = 'virtual:tessera-entry';
const RESOLVED_ENTRY_ID = '\0' + VIRTUAL_ENTRY_ID;
const VIRTUAL_MAIN_ID = '/virtual:tessera-main';
const RESOLVED_MAIN_ID = '\0virtual:tessera-main';

function tesseraEntryPlugin(): Plugin {
  const runtimeDir = resolveRuntimeDir();
  const stylesDir = resolveStylesDir();
  const appSveltePath = resolve(runtimeDir, 'App.svelte');
  let projectRoot: string;
  let outDir: string;
  let isBuild = false;

  return {
    name: 'tessera:entry',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      outDir = resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
    },

    // For build mode: write index.html so Rollup can find it
    buildStart() {
      if (isBuild) {
        writeFileSync(
          resolve(projectRoot, 'index.html'),
          generateIndexHtml(readLanguage(projectRoot)),
          'utf-8',
        );
      }
    },

    // For build mode: clean up temporary index.html and copy assets
    closeBundle() {
      if (isBuild) {
        const htmlPath = resolve(projectRoot, 'index.html');
        if (existsSync(htmlPath)) {
          try {
            unlinkSync(htmlPath);
          } catch {}
        }

        // Copy assets/ into the build's assets/ so $assets/ references resolve
        const assetsDir = resolve(projectRoot, 'assets');
        const distAssetsDir = resolve(outDir, 'assets');
        if (existsSync(assetsDir)) {
          mkdirSync(distAssetsDir, { recursive: true });
          cpSync(assetsDir, distAssetsDir, { recursive: true });
        }
      }
    },

    // Serve index.html for the dev server
    configureServer(server: ViteDevServer) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            const html = generateIndexHtml(readLanguage(projectRoot));
            const transformed = await server.transformIndexHtml(req.url, html);
            res.setHeader('Content-Type', 'text/html');
            res.statusCode = 200;
            res.end(transformed);
            return;
          }
          next();
        });
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID;
      if (id === VIRTUAL_MAIN_ID || id === 'virtual:tessera-main')
        return RESOLVED_MAIN_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID || id === RESOLVED_MAIN_ID) {
        return generateEntryScript(appSveltePath, stylesDir, projectRoot);
      }
      return null;
    },
  };
}

// 'en' fallback applied here: the config default-merge runs later than buildStart.
// Only a validated BCP-47 tag is interpolated into <html lang>, so a malformed
// value (caught separately as a warning) can't ship a broken attribute.
function readLanguage(projectRoot: string): string {
  const read = readCourseConfig(projectRoot);
  const lang = read.ok ? read.config.language : undefined;
  return isPlausibleLanguageTag(lang) ? lang : 'en';
}

function generateIndexHtml(lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tessera Course</title>
</head>
<body>
  <div id="tessera-root"></div>
  <script type="module" src="/virtual:tessera-main"></script>
</body>
</html>`;
}

function generateEntryScript(
  appSveltePath: string,
  frameworkStylesDir: string,
  projectRoot: string,
): string {
  const normalizedPath = appSveltePath.replace(/\\/g, '/');

  // Framework CSS imports (theme → base → layout)
  const frameworkCssOrder = ['theme.css', 'base.css', 'layout.css'];
  const frameworkImports = frameworkCssOrder
    .map((file) => resolve(frameworkStylesDir, file).replace(/\\/g, '/'))
    .filter((path) => existsSync(path))
    .map((path) => `import '${path}';`)
    .join('\n');

  // User CSS imports from project's styles/ directory
  const userStylesDir = resolve(projectRoot, 'styles');
  let userImports = '';
  if (existsSync(userStylesDir)) {
    const userCssFiles = readdirSync(userStylesDir)
      .filter((f) => f.endsWith('.css'))
      .sort();
    userImports = userCssFiles
      .map((f) => resolve(userStylesDir, f).replace(/\\/g, '/'))
      .map((path) => `import '${path}';`)
      .join('\n');
  }

  return `// Framework styles
${frameworkImports}
// User styles
${userImports}

import { mount } from 'svelte';
import App from '${normalizedPath}';

mount(App, {
  target: document.getElementById('tessera-root'),
});
`;
}

// ---------- Config Plugin ----------

const VIRTUAL_CONFIG_ID = 'virtual:tessera-config';
const RESOLVED_CONFIG_ID = '\0' + VIRTUAL_CONFIG_ID;

function completionDefaults(mode: string | undefined): {
  completion: Record<string, unknown>;
  passingScore: number;
} {
  if (mode === 'manual') {
    return { completion: { mode: 'manual' }, passingScore: 0 };
  }
  return {
    completion: {
      mode: 'percentage',
      percentageThreshold: DEFAULT_PERCENTAGE_THRESHOLD,
    },
    passingScore: DEFAULT_PASSING_SCORE,
  };
}

function tesseraConfigPlugin(): Plugin {
  let projectRoot: string;

  return {
    name: 'tessera:config',
    enforce: 'pre',

    config(config) {
      const root = config.root || process.cwd();

      return {
        base: './',
        build: {
          assetsDir: 'tessera',
        },
        resolve: {
          alias: {
            $assets: resolve(root, 'assets'),
          },
        },
        // tessera-learn ships .ts/.svelte.ts source; Vite's dep optimizer
        // doesn't run vite-plugin-svelte's preprocessor, so skip pre-bundling.
        optimizeDeps: {
          exclude: ['tessera-learn'],
        },
      };
    },

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_CONFIG_ID) return RESOLVED_CONFIG_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_CONFIG_ID) {
        const configPath = resolve(projectRoot, 'course.config.js');
        if (existsSync(configPath)) this.addWatchFile(configPath);
        const read = readCourseConfig(projectRoot);
        const userConfig: Partial<CourseConfig> = read.ok ? read.config : {};

        const { completion, passingScore } = completionDefaults(
          userConfig.completion?.mode,
        );
        const merged = {
          title: userConfig.title || 'Untitled Course',
          ...userConfig,
          navigation: { mode: 'free', ...userConfig.navigation },
          completion: { ...completion, ...userConfig.completion },
          scoring: { passingScore, ...userConfig.scoring },
          export: { standard: 'web', ...userConfig.export },
        };

        return `export default ${JSON.stringify(merged)};`;
      }
      return null;
    },
  };
}

// ---------- Manifest Watch Helpers ----------

/** Register all _meta.js and .svelte files under pagesDir as watch files for build mode. */
function addWatchFiles(
  ctx: { addWatchFile(id: string): void },
  dir: string,
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      addWatchFiles(ctx, full);
    } else if (entry.endsWith('.svelte') || entry === '_meta.js') {
      ctx.addWatchFile(full);
    }
  }
}

// ---------- Pages Plugin ----------

const VIRTUAL_PAGES_ID = 'virtual:tessera-pages';
const RESOLVED_PAGES_ID = '\0' + VIRTUAL_PAGES_ID;

/**
 * Provides a virtual module that exports an import.meta.glob map for all .svelte
 * pages. This runs in the user's project context so the glob resolves against their
 * pages/ directory, and Vite can statically analyze it for code splitting.
 */
function tesseraPagesPlugin(): Plugin {
  return {
    name: 'tessera:pages',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_PAGES_ID) return RESOLVED_PAGES_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_PAGES_ID) {
        return `export default import.meta.glob('/pages/**/*.svelte');`;
      }
      return null;
    },
  };
}

// ---------- Validation Plugin ----------

function tesseraValidationPlugin(): Plugin {
  let projectRoot: string;
  let isBuild = false;

  return {
    name: 'tessera:validation',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
      // Run validation during dev (configResolved fires before server starts)
      if (!isBuild) {
        runValidation(projectRoot);
      }
    },

    buildStart() {
      // Run validation during build (buildStart fires once before bundling)
      if (isBuild) {
        runValidation(projectRoot);
      }
    },
  };
}

// Tier 1a: flush + gate the Svelte compiler's a11y warnings at buildEnd, after
// every module is transformed. svelte() accepts `onwarn` but not arbitrary
// Rollup hooks, so the gate lives here and shares the onwarn closure.
function tesseraA11yCompilerPlugin(a11y: A11yCompilerState): Plugin {
  return {
    name: 'tessera:a11y-compiler',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      a11y.projectRoot = config.root;
      a11y.isBuild = config.command === 'build';
      const read = readCourseConfig(config.root);
      a11y.settings = normalizeA11y(read.ok ? read.config.a11y : undefined);
    },

    buildEnd() {
      if (!a11y.isBuild || a11y.warnings.length === 0) return;
      const ignored = new Set(a11y.settings.ignore);
      const warnings = a11y.warnings.filter((msg) => !isIgnored(msg, ignored));
      a11y.warnings = [];
      if (warnings.length === 0) return;
      if (a11y.settings.level === 'error') {
        reportValidationIssues({ errors: warnings, warnings: [] });
        throw new Error(
          `Tessera: ${warnings.length} a11y issue(s) with a11y.level: 'error'. Fix the errors above to continue.`,
        );
      }
      reportValidationIssues({ errors: [], warnings });
    },
  };
}

function runValidation(projectRoot: string): void {
  const result = validateProject(projectRoot);
  reportValidationIssues(result);
  if (result.errors.length > 0) {
    throw new Error(
      `Tessera validation failed with ${result.errors.length} error(s). Fix the errors above to continue.`,
    );
  }
}

// ---------- Export Plugin ----------

function tesseraExportPlugin(): Plugin {
  let projectRoot: string;
  let isBuild = false;

  return {
    name: 'tessera:export',
    enforce: 'post',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },

    async closeBundle() {
      if (!isBuild) return;
      if (isAuditBuild()) return;

      const read = readCourseConfig(projectRoot);
      if (!read.ok) {
        // Validation already required a parseable course.config.js — getting
        // here means it vanished or broke mid-build. Surface that loudly
        // rather than shipping a bundle with no LMS export silently.
        if (read.reason === 'missing') {
          throw new Error(
            '[tessera:export] course.config.js not found at closeBundle. The file must exist for the export step to run.',
          );
        }
        if (read.reason === 'no-export') {
          throw new Error(
            '[tessera:export] course.config.js: could not locate `export default { ... }`. Cannot determine export.standard.',
          );
        }
        throw new Error(
          `[tessera:export] course.config.js: failed to parse export-default object literal — ${(read.error as Error).message}`,
        );
      }

      await runExport(
        projectRoot,
        read.config as Parameters<typeof runExport>[1],
      );
    },
  };
}

// ---------- Manifest Plugin ----------

const VIRTUAL_MANIFEST_ID = 'virtual:tessera-manifest';
const RESOLVED_MANIFEST_ID = '\0' + VIRTUAL_MANIFEST_ID;

function tesseraManifestPlugin(manifestRef: {
  current: Manifest | null;
  root: string;
}): Plugin {
  let projectRoot: string;
  let pagesDir: string;

  function buildManifest(): Manifest {
    const m = generateManifest(pagesDir);
    manifestRef.current = m;
    return m;
  }

  return {
    name: 'tessera:manifest',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      pagesDir = resolve(projectRoot, 'pages');
      manifestRef.root = projectRoot;
    },

    configureServer(devServer: ViteDevServer) {
      // Watch the pages directory for changes
      devServer.watcher.on('all', (event, filePath) => {
        if (!filePath.startsWith(pagesDir)) return;

        // Rebuild manifest on relevant file changes
        const isRelevant =
          filePath.endsWith('.svelte') ||
          filePath.endsWith('_meta.js') ||
          event === 'addDir' ||
          event === 'unlinkDir';

        if (isRelevant) {
          manifestRef.current = null; // invalidate cache

          // Invalidate the virtual module to trigger HMR
          const mod = devServer.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID);
          if (mod) {
            devServer.moduleGraph.invalidateModule(mod);
            devServer.ws.send({ type: 'full-reload' });
          }

          console.log(
            `[tessera] Manifest rebuilt (${event}: ${filePath.replace(projectRoot, '')})`,
          );
        }
      });
    },

    buildStart() {
      buildManifest();
    },

    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_ID) {
        if (!manifestRef.current) {
          buildManifest();
        }

        // Register watch files so Vite's built-in watcher (used in build --watch)
        // knows to re-trigger when pages/ content changes.
        addWatchFiles(this, pagesDir);

        // Encode as base64 to prevent Vite's import analysis from
        // scanning .svelte importPath strings as module imports.
        // Replace Infinity with 1e9 since JSON.stringify drops it.
        const json = JSON.stringify(manifestRef.current, (_key, value) =>
          value === Infinity ? 1e9 : value,
        );
        const b64 = Buffer.from(json).toString('base64');
        return `export default JSON.parse(atob("${b64}"));`;
      }
      return null;
    },
  };
}

const VIRTUAL_ADAPTER_ID = 'virtual:tessera-adapter';
const RESOLVED_ADAPTER_ID = '\0' + VIRTUAL_ADAPTER_ID;

function tesseraAdapterPlugin(): Plugin {
  let projectRoot: string;
  let isBuild = false;

  return {
    name: 'tessera:adapter',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },

    resolveId(id) {
      if (id === VIRTUAL_ADAPTER_ID) return RESOLVED_ADAPTER_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_ADAPTER_ID) return null;

      // In dev, defer to the runtime selector so its WebAdapter fallback
      // for unreachable LMS APIs keeps working.
      if (!isBuild) {
        return `export { createAdapter } from 'tessera-learn/runtime/adapters/index.js';`;
      }

      let standard = 'web';
      const read = readCourseConfig(projectRoot);
      if (read.ok && typeof read.config.export?.standard === 'string') {
        standard = read.config.export.standard;
      }

      // The audit renders headless with no LMS in the frame chain; the SCORM/
      // cmi5 adapters throw when their API is absent, so render with WebAdapter.
      if (isAuditBuild()) standard = 'web';

      switch (standard) {
        case 'scorm12':
          return `
import { SCORM12Adapter } from 'tessera-learn/runtime/adapters/scorm12.js';
import { findSCORM12API } from 'tessera-learn/runtime/adapters/discovery.js';
import { LMSAdapterError } from 'tessera-learn/runtime/adapters/index.js';
export function createAdapter() {
  const api = findSCORM12API();
  if (!api) throw new LMSAdapterError('scorm12', 'Tessera: SCORM 1.2 API not found in window.parent/opener chain. Course must be launched from a SCORM 1.2 LMS.');
  return new SCORM12Adapter(api);
}
`;
        case 'scorm2004':
          return `
import { SCORM2004Adapter } from 'tessera-learn/runtime/adapters/scorm2004.js';
import { findSCORM2004API } from 'tessera-learn/runtime/adapters/discovery.js';
import { LMSAdapterError } from 'tessera-learn/runtime/adapters/index.js';
export function createAdapter() {
  const api = findSCORM2004API();
  if (!api) throw new LMSAdapterError('scorm2004', 'Tessera: SCORM 2004 API not found in window.parent/opener chain. Course must be launched from a SCORM 2004 LMS.');
  return new SCORM2004Adapter(api);
}
`;
        case 'cmi5':
          return `
import { CMI5Adapter } from 'tessera-learn/runtime/adapters/cmi5.js';
import { hasCMI5LaunchParams } from 'tessera-learn/runtime/adapters/discovery.js';
import { LMSAdapterError } from 'tessera-learn/runtime/adapters/index.js';
export function createAdapter() {
  if (!hasCMI5LaunchParams()) throw new LMSAdapterError('cmi5', 'Tessera: cmi5 launch parameters not present on URL. Course must be launched from a cmi5-compliant LMS.');
  return new CMI5Adapter();
}
`;
        default:
          return `
import { WebAdapter } from 'tessera-learn/runtime/adapters/web.js';
export function createAdapter(config) {
  return new WebAdapter(config);
}
`;
      }
    },
  };
}

const VIRTUAL_XAPI_SETUP_ID = 'virtual:tessera-xapi-setup';
const RESOLVED_XAPI_SETUP_ID = '\0' + VIRTUAL_XAPI_SETUP_ID;

function tesseraXAPISetupPlugin(): Plugin {
  let projectRoot: string;
  let isBuild = false;

  return {
    name: 'tessera:xapi-setup',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },

    resolveId(id) {
      if (id === VIRTUAL_XAPI_SETUP_ID) return RESOLVED_XAPI_SETUP_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_XAPI_SETUP_ID) return null;

      if (!isBuild) {
        return `export { buildXAPIClient } from 'tessera-learn/runtime/xapi/setup.js';`;
      }

      // The audit runs offline — don't wire real LRS destinations into it.
      if (isAuditBuild()) {
        return `export async function buildXAPIClient() { return null; }`;
      }

      let standard = 'web';
      let hasXapi = false;
      const read = readCourseConfig(projectRoot);
      if (read.ok) {
        if (typeof read.config.export?.standard === 'string')
          standard = read.config.export.standard;
        hasXapi = read.config.xapi != null;
      }

      // cmi5 needs the publisher regardless of explicit xapi config (cmi5
      // adapter shares the publisher queue for its own LMS-required statements).
      if (hasXapi || standard === 'cmi5') {
        return `export { buildXAPIClient } from 'tessera-learn/runtime/xapi/setup.js';`;
      }

      return `export async function buildXAPIClient() { return null; }`;
    },
  };
}

function tesseraFirstPagePreloadPlugin(manifestRef: {
  current: Manifest | null;
  root: string;
}): Plugin {
  return {
    name: 'tessera:first-page-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const firstPagePath = manifestRef.current?.pages[0]?.importPath;
        if (!firstPagePath || !ctx.bundle) return;
        const normalized = resolve(
          manifestRef.root,
          firstPagePath.replace(/^\//, ''),
        ).replace(/\\/g, '/');
        const chunk = Object.values(ctx.bundle).find(
          (c): c is import('vite').Rollup.OutputChunk =>
            c.type === 'chunk' &&
            !!c.facadeModuleId &&
            c.facadeModuleId.replace(/\\/g, '/') === normalized,
        );
        if (!chunk) return;
        return [
          {
            tag: 'link',
            attrs: { rel: 'modulepreload', href: `./${chunk.fileName}` },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
