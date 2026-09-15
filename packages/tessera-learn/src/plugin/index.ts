import type { Plugin, ResolvedConfig, Rollup, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, relative, isAbsolute, basename, sep } from 'node:path';
import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  cpSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import {
  generateManifest,
  readCourseConfig,
  readResolvedConfig,
  type CourseConfigRead,
} from './manifest.js';
import type { Manifest } from './manifest.js';
import type { CourseConfig } from '../runtime/types.js';
import {
  DEFAULT_PASSING_SCORE,
  DEFAULT_PERCENTAGE_THRESHOLD,
} from '../runtime/defaults.js';
import {
  DEFAULT_STANDARD,
  standardProfile,
  type LMSStandard,
} from '../runtime/standards.js';
import {
  validateProject,
  reportValidationIssues,
  normalizeA11y,
  isPlausibleLanguageTag,
  isIgnored,
  type A11ySettings,
} from './validation.js';
import { buildCsp } from './csp.js';
import { LMS_BUILD, runExport } from './export.js';
import { tesseraLayoutPlugin } from './layout.js';
import { tesseraQuizPlugin } from './quiz.js';
import { tesseraCourseRuntimePlugin } from './course-runtime.js';
import { resolvePackageRoot } from './package-root.js';
import { virtualModule } from './virtual-module.js';

import { AUDIT_ENV_FLAG } from './a11y/audit.js';

export { runAudit } from './a11y/audit.js';
export type { AuditOptions, ImpactLevel } from './a11y/audit.js';

function isAuditBuild(): boolean {
  return process.env[AUDIT_ENV_FLAG] === '1';
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

// Gates post-build side effects (asset copy, packaging) on a bundle that wrote
// cleanly. Set from the enforce:'post' plugin, so a throw in an earlier
// writeBundle leaves it closed.
interface BuildState {
  written: boolean;
}

interface ManifestRef {
  current: Manifest | null;
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

export function tesseraPlugin(options: { standardOverride?: string } = {}) {
  const { standardOverride } = options;
  const manifestRef: ManifestRef = { current: null };
  const a11y: A11yCompilerState = {
    warnings: [],
    projectRoot: '',
    isBuild: false,
    settings: normalizeA11y(undefined),
  };
  const build = { written: false };
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
    tesseraValidationPlugin(standardOverride),
    tesseraEntryPlugin(),
    tesseraIndexHtmlPlugin(standardOverride, build),
    tesseraConfigDefaultsPlugin(),
    tesseraConfigPlugin(standardOverride),
    tesseraPagesPlugin(),
    tesseraManifestPlugin(manifestRef),
    tesseraLayoutPlugin(),
    tesseraQuizPlugin(),
    tesseraCourseRuntimePlugin(),
    tesseraAdapterPlugin(standardOverride),
    tesseraXAPISetupPlugin(standardOverride),
    tesseraFirstPagePreloadPlugin(manifestRef),
    tesseraExportPlugin(standardOverride, build),
  ];
}

// ---------- Entry Plugin ----------

function tesseraEntryPlugin(): Plugin {
  const packageRoot = resolvePackageRoot();
  const appSveltePath = resolve(packageRoot, 'src', 'runtime', 'App.svelte');
  const stylesDir = resolve(packageRoot, 'styles');
  return virtualModule(
    'tessera:entry',
    'virtual:tessera-main',
    ({ projectRoot }) =>
      generateEntryScript(appSveltePath, stylesDir, projectRoot),
  );
}

function tesseraIndexHtmlPlugin(
  standardOverride: string | undefined,
  build: BuildState,
): Plugin {
  let projectRoot: string;
  let outDir: string;
  let isBuild = false;

  return {
    name: 'tessera:index-html',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      outDir = resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
    },

    // For build mode: write index.html so Rollup can find it
    buildStart() {
      if (isBuild) {
        const read = readResolvedConfig(projectRoot, standardOverride);
        writeFileSync(
          resolve(projectRoot, 'index.html'),
          generateIndexHtml(readLanguage(read), cspMeta(read)),
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

        if (!build.written) return;

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
            const html = generateIndexHtml(
              readLanguage(readCourseConfig(projectRoot)),
            );
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
  };
}

// 'en' fallback applied here: the config default-merge runs later than buildStart.
// Only a validated BCP-47 tag is interpolated into <html lang>, so a malformed
// value (caught separately as a warning) can't ship a broken attribute.
function readLanguage(read: CourseConfigRead): string {
  const lang = read.ok ? read.config.language : undefined;
  return isPlausibleLanguageTag(lang) ? lang : 'en';
}

// Web export only — never on LMS packages (whose iframe JS bridges a meta CSP
// could break) and never on the dev server (a meta connect-src would block
// Vite's HMR websocket). `export.csp` extends the baseline per-directive, or
// `false` drops the meta for deployments that set a CSP header themselves.
function cspMeta(read: CourseConfigRead & { standard: string }): string {
  const profile = standardProfile(read.standard);
  if (!profile || profile.packaged) return '';
  const csp = read.ok ? read.config.export?.csp : undefined;
  if (csp === false) return '';
  return `\n  <meta http-equiv="Content-Security-Policy" content="${buildCsp(csp)}" />`;
}

function generateIndexHtml(lang: string, csp = ''): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />${csp}
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
  const normalizedPath = normalizePath(appSveltePath);

  // Framework CSS imports (theme → base → layout)
  const frameworkCssOrder = ['theme.css', 'base.css', 'layout.css'];
  const frameworkImports = frameworkCssOrder
    .map((file) => normalizePath(resolve(frameworkStylesDir, file)))
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
      .map((f) => normalizePath(resolve(userStylesDir, f)))
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

function completionDefaults(mode: string | undefined): {
  completion: Record<string, unknown>;
  passingScore: number;
} {
  if (mode === 'manual') {
    return { completion: { mode: 'manual' }, passingScore: 0 };
  }
  if (mode === 'quiz') {
    return {
      completion: { mode: 'quiz' },
      passingScore: DEFAULT_PASSING_SCORE,
    };
  }
  return {
    completion: {
      mode: 'percentage',
      percentageThreshold: DEFAULT_PERCENTAGE_THRESHOLD,
    },
    passingScore: DEFAULT_PASSING_SCORE,
  };
}

function tesseraConfigDefaultsPlugin(): Plugin {
  return {
    name: 'tessera:config-defaults',
    enforce: 'pre',
    config(config) {
      const root = config.root || process.cwd();
      return {
        base: './',
        build: { assetsDir: 'tessera' },
        resolve: { alias: { $assets: resolve(root, 'assets') } },
        // tessera-learn ships .ts/.svelte.ts source; Vite's dep optimizer
        // doesn't run vite-plugin-svelte's preprocessor, so skip pre-bundling.
        optimizeDeps: { exclude: ['tessera-learn'] },
      };
    },
  };
}

/** Fill runtime defaults into a parsed course.config.js. Exported for tests. */
export function mergeCourseConfig(userConfig: Partial<CourseConfig>) {
  const { completion, passingScore } = completionDefaults(
    userConfig.completion?.mode,
  );
  return {
    ...userConfig,
    title: userConfig.title || 'Untitled Course',
    resume: userConfig.resume ?? 'auto',
    navigation: { mode: 'free', ...userConfig.navigation },
    completion: { ...completion, ...userConfig.completion },
    scoring: { passingScore, ...userConfig.scoring },
    export: { standard: DEFAULT_STANDARD, ...userConfig.export },
  };
}

function tesseraConfigPlugin(standardOverride?: string): Plugin {
  return virtualModule(
    'tessera:config',
    'virtual:tessera-config',
    function ({ projectRoot }) {
      const configPath = resolve(projectRoot, 'course.config.js');
      if (existsSync(configPath)) this.addWatchFile(configPath);
      // The runtime reads export.standard too, so readResolvedConfig must apply
      // the override here — the bundled config, not just the manifest/adapter.
      const read = readResolvedConfig(projectRoot, standardOverride);
      const userConfig: Partial<CourseConfig> = read.ok ? read.config : {};
      return `export default ${JSON.stringify(mergeCourseConfig(userConfig))};`;
    },
  );
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

/**
 * Provides a virtual module that exports an import.meta.glob map for all .svelte
 * pages. This runs in the user's project context so the glob resolves against their
 * pages/ directory, and Vite can statically analyze it for code splitting.
 */
function tesseraPagesPlugin(): Plugin {
  return virtualModule(
    'tessera:pages',
    'virtual:tessera-pages',
    () => `export default import.meta.glob('/pages/**/*.svelte');`,
  );
}

// ---------- Validation Plugin ----------

function tesseraValidationPlugin(standardOverride?: string): Plugin {
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
        runValidation(projectRoot, standardOverride);
      }
    },

    buildStart() {
      // Run validation during build (buildStart fires once before bundling)
      if (isBuild) {
        runValidation(projectRoot, standardOverride);
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

function runValidation(projectRoot: string, standardOverride?: string): void {
  const result = validateProject(projectRoot, standardOverride);
  reportValidationIssues(result);
  if (result.errors.length > 0) {
    throw new Error(
      `Tessera validation failed with ${result.errors.length} error(s). Fix the errors above to continue.`,
    );
  }
}

// ---------- Export Plugin ----------

function tesseraExportPlugin(
  standardOverride: string | undefined,
  build: BuildState,
): Plugin {
  let projectRoot: string;
  let isBuild = false;
  let emitted: string[] = [];

  return {
    name: 'tessera:export',
    enforce: 'post',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },

    writeBundle(options, bundle) {
      build.written = true;
      emitted = Object.keys(bundle).map((file) => resolve(options.dir!, file));
    },

    onLog(_level, log) {
      if (!isBuild || log.code !== 'IMPORT_IS_UNDEFINED') return;
      if (!projectFileRel(log.id, projectRoot)) return;
      build.written = false;
      for (const file of emitted) rmSync(file, { force: true });
      emitted = [];
      this.error(log);
    },

    async closeBundle() {
      const written = build.written;
      build.written = false;
      if (!isBuild) return;
      if (isAuditBuild()) return;
      if (!written) return;

      const read = readResolvedConfig(projectRoot, standardOverride);
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

      await runExport(projectRoot, mergeCourseConfig(read.config));
    },
  };
}

// ---------- Manifest Plugin ----------

function tesseraManifestPlugin(manifestRef: ManifestRef): Plugin {
  return virtualModule(
    'tessera:manifest',
    'virtual:tessera-manifest',
    function ({ projectRoot }) {
      const pagesDir = resolve(projectRoot, 'pages');
      const manifest = generateManifest(pagesDir);
      manifestRef.current = manifest;

      // Register watch files so Vite's built-in watcher (used in build --watch)
      // knows to re-trigger when pages/ content changes.
      addWatchFiles(this, pagesDir);

      // Encode as base64 to prevent Vite's import analysis from
      // scanning .svelte importPath strings as module imports.
      // Replace Infinity with 1e9 since JSON.stringify drops it.
      const json = JSON.stringify(manifest, (_key, value) =>
        value === Infinity ? 1e9 : value,
      );
      const b64 = Buffer.from(json).toString('base64');
      // atob yields Latin1 bytes; decode through UTF-8 or non-ASCII titles ship as mojibake.
      return `export default JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${b64}"),(c)=>c.charCodeAt(0))));`;
    },
    (event, filePath, { projectRoot }) => {
      if (!filePath.startsWith(resolve(projectRoot, 'pages') + sep)) {
        return false;
      }
      const isRelevant =
        filePath.endsWith('.svelte') ||
        basename(filePath) === '_meta.js' ||
        event === 'addDir' ||
        event === 'unlinkDir';
      if (isRelevant) {
        console.log(
          `[tessera] Manifest rebuilt (${event}: ${relative(projectRoot, filePath)})`,
        );
      }
      return isRelevant;
    },
  );
}

function generateLmsAdapterModule(standard: LMSStandard): string {
  const { adapter, detect, takesApi } = LMS_BUILD[standard];
  const guard = takesApi
    ? `const api = ${detect}();\n  if (!api) throw missingApiError('${standard}');\n  return new ${adapter}(api);`
    : `if (!${detect}()) throw missingApiError('${standard}');\n  return new ${adapter}();`;
  return `
import { ${adapter} } from 'tessera-learn/runtime/adapters/${standard}.js';
import { ${detect} } from 'tessera-learn/runtime/adapters/discovery.js';
import { missingApiError } from 'tessera-learn/runtime/adapters/lms-error.js';
export function createAdapter() {
  ${guard}
}
`;
}

function tesseraAdapterPlugin(standardOverride?: string): Plugin {
  return virtualModule(
    'tessera:adapter',
    'virtual:tessera-adapter',
    ({ projectRoot, isBuild }) => {
      // In dev, defer to the runtime selector so its WebAdapter fallback
      // for unreachable LMS APIs keeps working.
      if (!isBuild) {
        return `export { createAdapter } from 'tessera-learn/runtime/adapters/index.js';`;
      }

      let standard = readResolvedConfig(projectRoot, standardOverride).standard;

      // The audit renders headless with no LMS in the frame chain; the SCORM/
      // cmi5 adapters throw when their API is absent, so render with WebAdapter.
      if (isAuditBuild()) standard = DEFAULT_STANDARD;

      const profile = standardProfile(standard);
      if (profile?.packaged) return generateLmsAdapterModule(profile.id);
      return `
import { WebAdapter } from 'tessera-learn/runtime/adapters/web.js';
export function createAdapter(config, options) {
  return new WebAdapter(config, options && options.manifest);
}
`;
    },
  );
}

function tesseraXAPISetupPlugin(standardOverride?: string): Plugin {
  return virtualModule(
    'tessera:xapi-setup',
    'virtual:tessera-xapi-setup',
    ({ projectRoot, isBuild }) => {
      if (!isBuild) {
        return `export { buildXAPIClient } from 'tessera-learn/runtime/xapi/setup.js';`;
      }

      // The audit runs offline — don't wire real LRS destinations into it.
      if (isAuditBuild()) {
        return `export async function buildXAPIClient() { return null; }`;
      }

      const read = readResolvedConfig(projectRoot, standardOverride);
      const standard = read.standard;
      const entries =
        read.ok && read.config.xapi != null ? [read.config.xapi].flat() : [];
      const hasExplicit = entries.some((e) => e?.endpoint !== 'lms');

      // The launch standards (cmi5, plain xAPI) own a publisher the runtime
      // can share for `endpoint: 'lms'`, so wire the client regardless of
      // explicit xapi config.
      if (hasExplicit || standardProfile(standard)?.hasLaunchLRS) {
        return `export { buildXAPIClient } from 'tessera-learn/runtime/xapi/setup.js';`;
      }

      return `export async function buildXAPIClient() { return null; }`;
    },
  );
}

function tesseraFirstPagePreloadPlugin(manifestRef: ManifestRef): Plugin {
  let projectRoot: string;

  return {
    name: 'tessera:first-page-preload',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const firstPagePath = manifestRef.current?.pages[0]?.importPath;
        if (!firstPagePath || !ctx.bundle) return;
        const normalized = normalizePath(
          resolve(projectRoot, firstPagePath.replace(/^\//, '')),
        );
        const chunk = Object.values(ctx.bundle).find(
          (c): c is Rollup.OutputChunk =>
            c.type === 'chunk' &&
            !!c.facadeModuleId &&
            normalizePath(c.facadeModuleId) === normalized,
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
