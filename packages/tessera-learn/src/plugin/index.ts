import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, cpSync, mkdirSync } from 'node:fs';
import { generateManifest, extractDefaultExportObjectLiteral } from './manifest.js';
import JSON5 from 'json5';
import type { Manifest } from './manifest.js';
import { validateProject } from './validation.js';
import { runExport } from './export.js';
import { tesseraLayoutPlugin } from './layout.js';
import { tesseraQuizPlugin } from './quiz.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the runtime directory where App.svelte lives
function resolveRuntimeDir(): string {
  const packageRoot = resolve(__dirname, '..', '..');
  return resolve(packageRoot, 'src', 'runtime');
}

// Resolve the framework styles directory
function resolveStylesDir(): string {
  const packageRoot = resolve(__dirname, '..', '..');
  return resolve(packageRoot, 'styles');
}

export function tesseraPlugin() {
  return [
    svelte({
      compilerOptions: { css: 'external' },
    }),
    tesseraValidationPlugin(),
    tesseraEntryPlugin(),
    tesseraConfigPlugin(),
    tesseraPagesPlugin(),
    tesseraManifestPlugin(),
    tesseraLayoutPlugin(),
    tesseraQuizPlugin(),
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
  let isBuild = false;

  return {
    name: 'tessera:entry',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      isBuild = config.command === 'build';
    },

    // For build mode: write index.html so Rollup can find it
    buildStart() {
      if (isBuild) {
        writeFileSync(resolve(projectRoot, 'index.html'), generateIndexHtml(), 'utf-8');
      }
    },

    // For build mode: clean up temporary index.html and copy assets
    closeBundle() {
      if (isBuild) {
        const htmlPath = resolve(projectRoot, 'index.html');
        if (existsSync(htmlPath)) {
          try { unlinkSync(htmlPath); } catch {}
        }

        // Copy assets/ directory to dist/assets/ so $assets/ references resolve
        const assetsDir = resolve(projectRoot, 'assets');
        const distAssetsDir = resolve(projectRoot, 'dist', 'assets');
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
            const html = generateIndexHtml();
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
      if (id === VIRTUAL_MAIN_ID || id === 'virtual:tessera-main') return RESOLVED_MAIN_ID;
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

function generateIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
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

function generateEntryScript(appSveltePath: string, frameworkStylesDir: string, projectRoot: string): string {
  const normalizedPath = appSveltePath.replace(/\\/g, '/');

  // Framework CSS imports (theme → base → layout)
  const frameworkCssOrder = ['theme.css', 'base.css', 'layout.css'];
  const frameworkImports = frameworkCssOrder
    .map(file => resolve(frameworkStylesDir, file).replace(/\\/g, '/'))
    .filter(path => existsSync(path))
    .map(path => `import '${path}';`)
    .join('\n');

  // User CSS imports from project's styles/ directory
  const userStylesDir = resolve(projectRoot, 'styles');
  let userImports = '';
  if (existsSync(userStylesDir)) {
    const userCssFiles = readdirSync(userStylesDir)
      .filter(f => f.endsWith('.css'))
      .sort();
    userImports = userCssFiles
      .map(f => resolve(userStylesDir, f).replace(/\\/g, '/'))
      .map(path => `import '${path}';`)
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
  return { completion: { mode: 'percentage', percentageThreshold: 100 }, passingScore: 70 };
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
        resolve: {
          alias: {
            '$assets': resolve(root, 'assets'),
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
        let userConfig: Record<string, any> = {};

        if (existsSync(configPath)) {
          this.addWatchFile(configPath);
          const objectStr = extractDefaultExportObjectLiteral(readFileSync(configPath, 'utf-8'));
          if (objectStr) {
            try { userConfig = JSON5.parse(objectStr); } catch {}
          }
        }

        const { completion, passingScore } = completionDefaults(userConfig.completion?.mode);
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
function addWatchFiles(ctx: { addWatchFile(id: string): void }, dir: string): void {
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

function runValidation(projectRoot: string): void {
  const { errors, warnings } = validateProject(projectRoot);

  for (const warning of warnings) {
    console.warn(`\x1b[33m[tessera warning]\x1b[0m ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`\x1b[31m[tessera error]\x1b[0m ${error}`);
    }
    throw new Error(
      `Tessera validation failed with ${errors.length} error(s). Fix the errors above to continue.`
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

      const configPath = resolve(projectRoot, 'course.config.js');
      if (!existsSync(configPath)) {
        // Validation already required course.config.js — getting here means
        // the file vanished mid-build. Surface that loudly rather than
        // shipping a bundle with no LMS export silently.
        throw new Error(
          '[tessera:export] course.config.js not found at closeBundle. The file must exist for the export step to run.'
        );
      }

      const objectStr = extractDefaultExportObjectLiteral(readFileSync(configPath, 'utf-8'));
      if (!objectStr) {
        throw new Error(
          '[tessera:export] course.config.js: could not locate `export default { ... }`. Cannot determine export.standard.'
        );
      }

      let config: any;
      try {
        config = JSON5.parse(objectStr);
      } catch (err) {
        throw new Error(
          `[tessera:export] course.config.js: failed to parse export-default object literal — ${(err as Error).message}`
        );
      }

      await runExport(projectRoot, config);
    },
  };
}

// ---------- Manifest Plugin ----------

const VIRTUAL_MANIFEST_ID = 'virtual:tessera-manifest';
const RESOLVED_MANIFEST_ID = '\0' + VIRTUAL_MANIFEST_ID;

function tesseraManifestPlugin(): Plugin {
  let projectRoot: string;
  let pagesDir: string;
  let currentManifest: Manifest | null = null;
  let server: ViteDevServer | null = null;

  function buildManifest(): Manifest {
    currentManifest = generateManifest(pagesDir);
    return currentManifest;
  }

  return {
    name: 'tessera:manifest',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
      pagesDir = resolve(projectRoot, 'pages');
    },

    configureServer(devServer: ViteDevServer) {
      server = devServer;

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
          currentManifest = null; // invalidate cache

          // Invalidate the virtual module to trigger HMR
          const mod = devServer.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID);
          if (mod) {
            devServer.moduleGraph.invalidateModule(mod);
            devServer.ws.send({ type: 'full-reload' });
          }

          console.log(`[tessera] Manifest rebuilt (${event}: ${filePath.replace(projectRoot, '')})`);
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
        if (!currentManifest) {
          buildManifest();
        }

        // Register watch files so Vite's built-in watcher (used in build --watch)
        // knows to re-trigger when pages/ content changes.
        addWatchFiles(this, pagesDir);

        // Encode as base64 to prevent Vite's import analysis from
        // scanning .svelte importPath strings as module imports.
        // Replace Infinity with 1e9 since JSON.stringify drops it.
        const json = JSON.stringify(currentManifest, (_key, value) =>
          value === Infinity ? 1e9 : value
        );
        const b64 = Buffer.from(json).toString('base64');
        return `export default JSON.parse(atob("${b64}"));`;
      }
      return null;
    },
  };
}
