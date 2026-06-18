import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { ZipArchive } from 'archiver';
import { slugify } from '../runtime/slugify.js';

// ---------- Types ----------

interface ExportConfig {
  title: string;
  id?: string;
  description?: string;
  version?: string;
  scoring?: { passingScore?: number };
  completion?: { mode?: 'quiz' | 'percentage' };
  export?: { standard?: string };
}

// ---------- Helpers ----------

const UNTITLED_TITLE = 'Untitled Course';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Recursively collect all file paths relative to a directory.
 */
function collectFiles(dir: string, base: string = ''): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry);
    const relPath = base ? `${base}/${entry}` : entry;
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath, relPath));
    } else {
      files.push(relPath);
    }
  }
  return files;
}

/**
 * Derive a stable URN IRI from a seed string. cmi5 §13.1 / xs:anyURI
 * require course / AU ids to be IRIs — bare hex or UUID-shaped strings
 * (without correct version/variant bits) aren't conformant URNs and may
 * be rejected by strict LMS importers.
 *
 * Hash the seed so the id survives rebuilds, then format as
 * `urn:tessera:<kind>:<hex>`. The same seed always produces the same
 * IRI, so existing LRS records are not orphaned by re-export.
 */
function stableUrn(kind: 'course' | 'au', seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  // 32 hex chars (128 bits of entropy) is plenty; trim to keep ids short.
  return `urn:tessera:${kind}:${h.slice(0, 32)}`;
}

function courseIdentity(config: ExportConfig): string {
  return (typeof config.id === 'string' && config.id.trim()) || '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Manifest Generators ----------

/** Per-version XML differences in imsmanifest.xml between SCORM 1.2 and 2004. */
interface ScormManifestDialect {
  rootNs: string;
  adlcpNs: string;
  schemaversion: string;
  /** Attribute name on <resource>: SCORM 1.2 uses lowercase, 2004 uses camelCase. */
  scormTypeAttr: 'scormtype' | 'scormType';
  /** Whitespace-separated namespace+XSD pairs for xsi:schemaLocation. */
  schemaLocation: string;
}

const SCORM_DIALECTS: Record<'1.2' | '2004', ScormManifestDialect> = {
  '1.2': {
    rootNs: 'http://www.imsproject.org/xsd/imscp_rootv1p1p2',
    adlcpNs: 'http://www.adlnet.org/xsd/adlcp_rootv1p2',
    schemaversion: '1.2',
    scormTypeAttr: 'scormtype',
    schemaLocation:
      'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd ' +
      'http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd ' +
      'http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd',
  },
  '2004': {
    rootNs: 'http://www.imsglobal.org/xsd/imscp_v1p1',
    adlcpNs: 'http://www.adlnet.org/xsd/adlcp_v1p3',
    schemaversion: '2004 4th Edition',
    scormTypeAttr: 'scormType',
    schemaLocation:
      'http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd ' +
      'http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd',
  },
};

export function generateScormManifest(
  version: '1.2' | '2004',
  config: ExportConfig,
  distDir: string,
): string {
  const dialect = SCORM_DIALECTS[version];
  const title = escapeXml(config.title || UNTITLED_TITLE);
  const files = collectFiles(distDir);
  const fileElements = files
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="tessera-course" version="1.0"
  xmlns="${dialect.rootNs}"
  xmlns:adlcp="${dialect.adlcpNs}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${dialect.schemaLocation}">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>${dialect.schemaversion}</schemaversion>
  </metadata>
  <organizations default="org-1">
    <organization identifier="org-1">
      <title>${title}</title>
      <item identifier="item-1" identifierref="res-1">
        <title>${title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" adlcp:${dialect.scormTypeAttr}="sco" href="index.html">
${fileElements}
    </resource>
  </resources>
</manifest>`;
}

export function generateCMI5Xml(config: ExportConfig): string {
  const title = escapeXml(config.title || UNTITLED_TITLE);
  const description = escapeXml(config.description || '');
  // Derive stable IDs from the course title so they survive rebuilds without
  // orphaning existing learner records in the LRS.
  const id = courseIdentity(config);
  const courseId = stableUrn(
    'course',
    id || `tessera-course:${config.title || ''}`,
  );
  const auId = stableUrn(
    'au',
    id ? `${id}#au` : `tessera-au:${config.title || ''}`,
  );
  // cmi5 §10.2.4 caps masteryScore at 4 decimals; avoid float drift like 0.7000000000000001.
  const masteryScore = Number(
    ((config.scoring?.passingScore ?? 70) / 100).toFixed(4),
  );
  // cmi5 §13.1.4 — `moveOn` decides which verb(s) the LMS treats as
  // satisfying the AU. For graded courses (completion gated on a quiz)
  // a learner who completes without passing should NOT receive credit, so
  // the LMS needs both a Completed AND a Passed before satisfaction.
  // Percentage-mode courses don't surface pass/fail, so completion alone
  // is the right signal.
  const moveOn =
    config.completion?.mode === 'quiz' ? 'CompletedAndPassed' : 'Completed';

  return `<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="${courseId}">
    <title><langstring lang="en-US">${title}</langstring></title>
    <description><langstring lang="en-US">${description}</langstring></description>
  </course>
  <au id="${auId}" launchMethod="AnyWindow" moveOn="${moveOn}" masteryScore="${masteryScore}">
    <title><langstring lang="en-US">${title}</langstring></title>
    <description><langstring lang="en-US">${description}</langstring></description>
    <url>index.html</url>
  </au>
</courseStructure>`;
}

export function generateTincanXml(config: ExportConfig): string {
  const title = escapeXml(config.title || UNTITLED_TITLE);
  const description = escapeXml(config.description || '');
  // Reuse the cmi5/SCORM stable-id scheme so re-exports don't orphan LRS records.
  const id = courseIdentity(config);
  const auId = stableUrn(
    'au',
    id ? `${id}#au` : `tessera-au:${config.title || ''}`,
  );
  // tincan.xml carries NO xAPI version — the version is set at runtime by the
  // adapter's X-Experience-API-Version header, not declared in the manifest.
  return `<?xml version="1.0" encoding="UTF-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="${auId}" type="http://adlnet.gov/expapi/activities/course">
      <name>${title}</name>
      <description lang="en-US">${description}</description>
      <launch lang="en-US">index.html</launch>
    </activity>
  </activities>
</tincan>`;
}

// ---------- ZIP Packaging ----------

export async function createZip(
  distDir: string,
  outputPath: string,
): Promise<number> {
  return new Promise((res, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      res(archive.pointer());
    });
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(distDir, false);
    void archive.finalize();
  });
}

// ---------- Main Export ----------

/**
 * Run the export process after Vite build completes.
 * Writes manifest XML into dist/, then packages into ZIP if needed.
 */
/** Remove any previously built zips for this package to prevent accumulation. */
function cleanOldZips(projectRoot: string, slug: string): void {
  try {
    for (const f of readdirSync(projectRoot)) {
      if (f.startsWith(`${slug}-`) && f.endsWith('.zip')) {
        try {
          unlinkSync(resolve(projectRoot, f));
        } catch {}
      }
    }
  } catch {}
}

/** Packaged (zipped) export targets: which manifest file to write and how. */
const PACKAGED_EXPORTS: Record<
  'scorm12' | 'scorm2004' | 'cmi5' | 'xapi',
  {
    manifestFile: string;
    label: string;
    generate: (config: ExportConfig, distDir: string) => string;
  }
> = {
  scorm12: {
    manifestFile: 'imsmanifest.xml',
    label: 'SCORM 1.2',
    generate: (config, distDir) =>
      generateScormManifest('1.2', config, distDir),
  },
  scorm2004: {
    manifestFile: 'imsmanifest.xml',
    label: 'SCORM 2004',
    generate: (config, distDir) =>
      generateScormManifest('2004', config, distDir),
  },
  cmi5: {
    manifestFile: 'cmi5.xml',
    label: 'CMI5',
    generate: (config) => generateCMI5Xml(config),
  },
  xapi: {
    manifestFile: 'tincan.xml',
    label: 'xAPI 1.0.3',
    generate: (config) => generateTincanXml(config),
  },
};

export async function runExport(
  projectRoot: string,
  config: ExportConfig,
): Promise<void> {
  const distDir = resolve(projectRoot, 'dist');
  const standard = config.export?.standard || 'web';
  const slug = slugify(config.title || 'tessera-course') || 'tessera-course';
  const version = config.version || '1.0.0';
  const zipName = `${slug}-${version}.zip`;
  const zipPath = resolve(projectRoot, zipName);

  if (standard === 'web') {
    const files = collectFiles(distDir);
    let totalSize = 0;
    for (const f of files) totalSize += statSync(resolve(distDir, f)).size;
    console.log(`✓ Web export: dist/ (${formatSize(totalSize)})`);
    return;
  }

  const spec = PACKAGED_EXPORTS[standard as keyof typeof PACKAGED_EXPORTS];
  if (!spec) return; // unknown standard — the validator rejects these upstream

  writeFileSync(
    resolve(distDir, spec.manifestFile),
    spec.generate(config, distDir),
    'utf-8',
  );
  cleanOldZips(projectRoot, slug);
  const zipSize = await createZip(distDir, zipPath);
  console.log(`✓ ${spec.label} export: ${zipName} (${formatSize(zipSize)})`);
}
