import type { Plugin, Rollup } from 'vite';
import { normalizePath } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, relative, isAbsolute, dirname, join } from 'node:path';
import {
  existsSync,
  readdirSync,
  writeFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import {
  generateManifest,
  walkPages,
  type CourseConfigRead,
  type Manifest,
  type ResolvedConfigRead,
} from './manifest.js';
import type { CourseConfig } from '../runtime/types.js';
import {
  DEFAULT_PASSING_SCORE,
  DEFAULT_PERCENTAGE_THRESHOLD,
} from '../runtime/defaults.js';
import {
  DEFAULT_STANDARD,
  type LMSStandard,
  type StandardId,
} from '../runtime/standards.js';
import {
  validateProject,
  reportValidationIssues,
  isPlausibleLanguageTag,
  isIgnored,
} from './validation.js';
import { buildCsp } from './csp.js';
import { LMS_BUILD, runExport } from './export.js';
import { tesseraLayoutPlugin } from './layout.js';
import { tesseraQuizPlugin } from './quiz.js';
import { tesseraCourseRuntimePlugin } from './course-runtime.js';
import { resolvePackageRoot } from './package-root.js';
import { virtualModule } from './virtual-module.js';
import { BuildContext, isInside } from './build-context.js';

import { AUDIT_ENV_FLAG } from './a11y/audit.js';

export { runAudit } from './a11y/audit.js';
export type { AuditOptions, ImpactLevel } from './a11y/audit.js';

function isAuditBuild(): boolean {
  return process.env[AUDIT_ENV_FLAG] === '1';
}

// Svelte's onwarn filename is relative to the vite root (e.g. `pages/x.svelte`)
// in build and may be absolute or a virtual id elsewhere. Return the
// project-relative path for a real author file, or null to skip framework /
// node_modules / virtual modules — Tier 0 owns the framework's own warnings.
function projectFileRel(
  filename: string | undefined,
  projectRoot: string,
): string | null {
  if (!filename) return null;
  if (
    filename.startsWith('\0') ||
    filename.includes('virtual:') ||
    filename.includes('node_modules')
  ) {
    return null;
  }
  const abs = isAbsolute(filename) ? filename : resolve(projectRoot, filename);
  return isInside(projectRoot, abs) ? relative(projectRoot, abs) : null;
}

export function tesseraPlugin(options: { standardOverride?: StandardId } = {}) {
  const ctx = new BuildContext(options.standardOverride);
  return [
    {
      name: 'tessera:context',
      enforce: 'pre',
      configResolved(config) {
        ctx.configure(config);
      },
    } satisfies Plugin,
    svelte({
      compilerOptions: { css: 'external' },
      onwarn(warning, defaultHandler) {
        if (warning.code?.startsWith('a11y')) {
          const rel = projectFileRel(warning.filename, ctx.root);
          if (rel !== null) {
            const msg = `[${warning.code}] ${rel}: ${warning.message}`;
            if (ctx.isBuild) {
              ctx.a11yWarnings.push(msg);
            } else if (!ctx.a11ySettings().ignore.includes(warning.code)) {
              reportValidationIssues({ errors: [], warnings: [msg] });
            }
          }
          return; // suppress the raw Vite print; we re-emit via the reporter
        }
        defaultHandler?.(warning);
      },
    }),
    tesseraA11yCompilerPlugin(ctx),
    tesseraValidationPlugin(ctx),
    tesseraEntryPlugin(ctx),
    tesseraIndexHtmlPlugin(ctx),
    tesseraConfigDefaultsPlugin(),
    tesseraConfigPlugin(ctx),
    tesseraPagesPlugin(),
    tesseraManifestPlugin(ctx),
    tesseraLayoutPlugin(ctx),
    tesseraQuizPlugin(ctx),
    tesseraCourseRuntimePlugin(ctx),
    tesseraAdapterPlugin(ctx),
    tesseraXAPISetupPlugin(ctx),
    tesseraFirstPagePreloadPlugin(ctx),
    tesseraExportPlugin(ctx),
  ];
}

// ---------- Entry Plugin ----------

function tesseraEntryPlugin(ctx: BuildContext): Plugin {
  const packageRoot = resolvePackageRoot();
  const appPath = normalizePath(
    resolve(packageRoot, 'src', 'runtime', 'App.svelte'),
  );
  const frameworkStyles = ['theme.css', 'base.css', 'layout.css'].map((file) =>
    normalizePath(resolve(packageRoot, 'styles', file)),
  );
  return virtualModule(
    'tessera:entry',
    'virtual:tessera-main',
    () =>
      generateEntryScript(appPath, [
        ...frameworkStyles,
        ...userStylesheets(ctx.root),
      ]),
    (type, file) =>
      type !== 'update' &&
      file.endsWith('.css') &&
      dirname(file) === stylesDir(ctx.root),
  );
}

function tesseraIndexHtmlPlugin(ctx: BuildContext): Plugin {
  return {
    name: 'tessera:index-html',
    enforce: 'pre',

    // For build mode: write index.html so Rollup can find it
    buildStart() {
      if (ctx.isBuild) {
        const read = ctx.readConfig();
        writeFileSync(
          resolve(ctx.root, 'index.html'),
          generateIndexHtml(readLanguage(read), cspMeta(read)),
          'utf-8',
        );
      }
    },

    // For build mode: clean up temporary index.html
    closeBundle() {
      if (ctx.isBuild) rmSync(resolve(ctx.root, 'index.html'), { force: true });
    },

    // Serve index.html for the dev server
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            const html = generateIndexHtml(readLanguage(ctx.readConfig()));
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
function cspMeta(read: ResolvedConfigRead): string {
  if (!read.profile || read.profile.packaged) return '';
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

function stylesDir(projectRoot: string): string {
  return normalizePath(resolve(projectRoot, 'styles'));
}

function userStylesheets(projectRoot: string): string[] {
  const dir = stylesDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map((file) => `${dir}/${file}`);
}

function generateEntryScript(appPath: string, stylesheets: string[]): string {
  return `${stylesheets.map((path) => `import '${path}';`).join('\n')}

import { mount } from 'svelte';
import App from '${appPath}';

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
    export: {
      ...userConfig.export,
      standard: userConfig.export?.standard ?? DEFAULT_STANDARD,
    },
  };
}

function tesseraConfigPlugin(ctx: BuildContext): Plugin {
  return virtualModule('tessera:config', 'virtual:tessera-config', function () {
    const configPath = resolve(ctx.root, 'course.config.js');
    if (existsSync(configPath)) this.addWatchFile(configPath);
    // The runtime reads export.standard too, so the override must apply to
    // the bundled config, not just the manifest/adapter.
    const read = ctx.readConfig();
    const userConfig: Partial<CourseConfig> = read.ok ? read.config : {};
    return `export default ${JSON.stringify(mergeCourseConfig(userConfig))};`;
  });
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

function tesseraValidationPlugin(ctx: BuildContext): Plugin {
  return {
    name: 'tessera:validation',
    enforce: 'pre',

    configureServer() {
      runValidation(ctx);
    },

    buildStart() {
      if (ctx.isBuild) runValidation(ctx);
    },
  };
}

// Tier 1a: flush + gate the Svelte compiler's a11y warnings at buildEnd, after
// every module is transformed. svelte() accepts `onwarn` but not arbitrary
// Rollup hooks, so the gate lives here and shares the onwarn closure.
function tesseraA11yCompilerPlugin(ctx: BuildContext): Plugin {
  return {
    name: 'tessera:a11y-compiler',
    enforce: 'pre',
    apply: 'build',

    buildEnd() {
      if (ctx.a11yWarnings.length === 0) return;
      const settings = ctx.a11ySettings();
      const ignored = new Set(settings.ignore);
      const warnings = ctx.a11yWarnings.filter(
        (msg) => !isIgnored(msg, ignored),
      );
      ctx.a11yWarnings = [];
      if (warnings.length === 0) return;
      if (settings.level === 'error') {
        reportValidationIssues({ errors: warnings, warnings: [] });
        throw new Error(
          `Tessera: ${warnings.length} a11y issue(s) with a11y.level: 'error'. Fix the errors above to continue.`,
        );
      }
      reportValidationIssues({ errors: [], warnings });
    },
  };
}

function runValidation(ctx: BuildContext): void {
  const result = validateProject(ctx.root, ctx.standardOverride);
  reportValidationIssues(result);
  if (result.errors.length > 0) {
    throw new Error(
      `Tessera validation failed with ${result.errors.length} error(s). Fix the errors above to continue.`,
    );
  }
}

// ---------- Export Plugin ----------

function tesseraExportPlugin(ctx: BuildContext): Plugin {
  let emitted: string[] = [];
  // Gates post-build side effects (asset copy, packaging) on a bundle that wrote
  // cleanly. Set from this enforce:'post' plugin, so a throw in an earlier
  // writeBundle leaves it closed.
  let written = false;

  return {
    name: 'tessera:export',
    enforce: 'post',
    apply: 'build',

    writeBundle(options, bundle) {
      written = true;
      emitted = Object.keys(bundle).map((file) => resolve(ctx.outDir, file));
    },

    onLog(_level, log) {
      if (log.code !== 'IMPORT_IS_UNDEFINED') return;
      if (!projectFileRel(log.id, ctx.root)) return;
      written = false;
      for (const file of emitted) rmSync(file, { force: true });
      emitted = [];
      this.error(log);
    },

    async closeBundle() {
      if (!written) return;
      written = false;

      // Copy assets/ into the build's assets/ so $assets/ references resolve
      const assetsDir = resolve(ctx.root, 'assets');
      if (existsSync(assetsDir)) {
        cpSync(assetsDir, resolve(ctx.outDir, 'assets'), { recursive: true });
      }

      if (isAuditBuild()) return;

      const read = ctx.readConfig();
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

      await runExport(ctx.root, ctx.outDir, mergeCourseConfig(read.config));
    },
  };
}

// ---------- Manifest Plugin ----------

// Encode as base64 to prevent Vite's import analysis from
// scanning .svelte importPath strings as module imports.
// Replace Infinity with 1e9 since JSON.stringify drops it.
function manifestModule(manifest: Manifest): string {
  const json = JSON.stringify(manifest, (_key, value) =>
    value === Infinity ? 1e9 : value,
  );
  const b64 = Buffer.from(json).toString('base64');
  // atob yields Latin1 bytes; decode through UTF-8 or non-ASCII titles ship as mojibake.
  return `export default JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${b64}"),(c)=>c.charCodeAt(0))));`;
}

function tesseraManifestPlugin(ctx: BuildContext): Plugin {
  let loaded: string | undefined;

  return virtualModule(
    'tessera:manifest',
    'virtual:tessera-manifest',
    function () {
      const pagesDir = resolve(ctx.root, 'pages');
      const sections = walkPages(pagesDir);
      ctx.manifest = generateManifest(pagesDir, sections);

      for (const section of sections) {
        for (const { metaPath } of [section, ...section.lessons]) {
          if (existsSync(metaPath)) this.addWatchFile(metaPath);
        }
        for (const lesson of section.lessons) {
          for (const file of lesson.files) {
            this.addWatchFile(resolve(lesson.dir, file));
          }
        }
      }

      loaded = manifestModule(ctx.manifest);
      return loaded;
    },
    (_type, file) => {
      const pagesDir = resolve(ctx.root, 'pages');
      return (
        file.startsWith(normalizePath(pagesDir) + '/') &&
        (file.endsWith('.svelte') || file.endsWith('/_meta.js')) &&
        manifestModule(generateManifest(pagesDir)) !== loaded
      );
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

function tesseraAdapterPlugin(ctx: BuildContext): Plugin {
  return virtualModule('tessera:adapter', 'virtual:tessera-adapter', () => {
    // In dev, defer to the runtime selector so its WebAdapter fallback
    // for unreachable LMS APIs keeps working.
    if (!ctx.isBuild) {
      return `export { createAdapter } from 'tessera-learn/runtime/adapters/index.js';`;
    }

    // The audit renders headless with no LMS in the frame chain; the SCORM/
    // cmi5 adapters throw when their API is absent, so render with WebAdapter.
    const profile = isAuditBuild() ? undefined : ctx.readConfig().profile;
    if (profile?.packaged) return generateLmsAdapterModule(profile.id);
    return `
import { WebAdapter } from 'tessera-learn/runtime/adapters/web.js';
export function createAdapter(config, options) {
  return new WebAdapter(config, options && options.manifest);
}
`;
  });
}

function tesseraXAPISetupPlugin(ctx: BuildContext): Plugin {
  return virtualModule('tessera:xapi-setup', 'virtual:tessera-xapi-setup', () =>
    // The audit runs offline, so it never wires real LRS destinations.
    !ctx.isBuild || (!isAuditBuild() && wiresXAPIClient(ctx.readConfig()))
      ? `export { buildXAPIClient } from 'tessera-learn/runtime/xapi/setup.js';`
      : `export async function buildXAPIClient() { return null; }`,
  );
}

// The launch standards (cmi5, plain xAPI) own a publisher the runtime can share
// for `endpoint: 'lms'`, so they wire the client regardless of explicit xapi config.
function wiresXAPIClient(read: ResolvedConfigRead): boolean {
  const entries =
    read.ok && read.config.xapi != null ? [read.config.xapi].flat() : [];
  return (
    entries.some((e) => e?.endpoint !== 'lms') || !!read.profile?.hasLaunchLRS
  );
}

function tesseraFirstPagePreloadPlugin(ctx: BuildContext): Plugin {
  return {
    name: 'tessera:first-page-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const firstPagePath = ctx.manifest?.pages[0]?.importPath;
        if (!firstPagePath || !bundle) return;
        const normalized = normalizePath(join(ctx.root, firstPagePath));
        const chunk = Object.values(bundle).find(
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
