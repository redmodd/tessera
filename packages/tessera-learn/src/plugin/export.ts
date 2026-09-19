import {
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ZipArchive } from 'archiver';
import { courseIdentity, type CourseConfig } from '../runtime/types.js';
import { standardProfile, type LMSStandard } from '../runtime/standards.js';
import { formatReal107, toScaled } from '../runtime/adapters/format.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------- Types ----------

type ExportConfig = Pick<
  CourseConfig,
  'title' | 'id' | 'description' | 'version' | 'scoring' | 'export'
> &
  Partial<Pick<CourseConfig, 'completion'>>;

// ---------- Helpers ----------

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

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    // Dirent is lstat-based; stat symlinks so a symlinked dir still recurses.
    const isDir = entry.isSymbolicLink()
      ? statSync(resolve(dir, entry.name)).isDirectory()
      : entry.isDirectory();
    if (isDir) {
      files.push(...collectFiles(resolve(dir, entry.name), relPath));
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

// AU activity id, derived from the course id so re-exports don't orphan LRS
// records. Shared by the cmi5 and tincan manifests.
function auIdFor(config: ExportConfig): string {
  const id = courseIdentity(config);
  return stableUrn('au', id ? `${id}#au` : 'tessera-au');
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
  xmlns: { adlcp: string } & Record<string, string>;
  schemaversion: string;
  /** Attribute name on <resource>: SCORM 1.2 uses lowercase, 2004 uses camelCase. */
  scormTypeAttr: 'scormtype' | 'scormType';
  /** Whitespace-separated namespace+XSD pairs for xsi:schemaLocation. */
  schemaLocation: string;
  passMark(passingScore: number): string;
}

function generateScormManifest(
  dialect: ScormManifestDialect,
  config: ExportConfig,
  outDir: string,
): string {
  const title = escapeXml(config.title);
  const files = collectFiles(outDir);
  const fileElements = files
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join('\n');
  const xmlns = Object.entries(dialect.xmlns)
    .map(([prefix, uri]) => `\n  xmlns:${prefix}="${uri}"`)
    .join('');
  const passMark =
    config.completion?.mode !== 'manual'
      ? `\n        ${dialect.passMark(config.scoring.passingScore)}`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="tessera-course" version="1.0"
  xmlns="${dialect.rootNs}"${xmlns}
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
        <title>${title}</title>${passMark}
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
  const title = escapeXml(config.title);
  const description = escapeXml(config.description || '');
  // Derive stable IDs from the course id so they survive rebuilds without
  // orphaning existing learner records in the LRS.
  const courseId = stableUrn(
    'course',
    courseIdentity(config) || 'tessera-course',
  );
  const auId = auIdFor(config);
  // cmi5 §10.2.4 caps masteryScore at 4 decimals; avoid float drift like 0.7000000000000001.
  const masteryScore = Number((config.scoring.passingScore / 100).toFixed(4));
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
  const title = escapeXml(config.title);
  const description = escapeXml(config.description || '');
  // Reuse the cmi5/SCORM stable-id scheme so re-exports don't orphan LRS records.
  const auId = auIdFor(config);
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
  outDir: string,
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
    archive.directory(outDir, false);
    void archive.finalize();
  });
}

// ---------- Main Export ----------

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

type ManifestGenerator = (config: ExportConfig, outDir: string) => string;

const scormManifest =
  (dialect: ScormManifestDialect): ManifestGenerator =>
  (config, outDir) =>
    generateScormManifest(dialect, config, outDir);

/** Build-side half of each packaged standard: manifest generation and adapter codegen. */
export const LMS_BUILD: Record<
  LMSStandard,
  {
    manifestFile: string;
    generate: ManifestGenerator;
    adapter: string;
    detect: string;
    /** SCORM detectors return the API object the constructor needs; cmi5/xAPI ones return a boolean. */
    takesApi: boolean;
  }
> = {
  scorm12: {
    manifestFile: 'imsmanifest.xml',
    generate: scormManifest({
      rootNs: 'http://www.imsproject.org/xsd/imscp_rootv1p1p2',
      xmlns: { adlcp: 'http://www.adlnet.org/xsd/adlcp_rootv1p2' },
      schemaversion: '1.2',
      scormTypeAttr: 'scormtype',
      schemaLocation:
        'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd ' +
        'http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd ' +
        'http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd',
      passMark: (score) =>
        `<adlcp:masteryscore>${formatReal107(score)}</adlcp:masteryscore>`,
    }),
    adapter: 'SCORM12Adapter',
    detect: 'findSCORM12API',
    takesApi: true,
  },
  scorm2004: {
    manifestFile: 'imsmanifest.xml',
    generate: scormManifest({
      rootNs: 'http://www.imsglobal.org/xsd/imscp_v1p1',
      xmlns: {
        adlcp: 'http://www.adlnet.org/xsd/adlcp_v1p3',
        imsss: 'http://www.imsglobal.org/xsd/imsss',
      },
      schemaversion: '2004 4th Edition',
      scormTypeAttr: 'scormType',
      schemaLocation:
        'http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd ' +
        'http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd ' +
        'http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd',
      passMark: (score) => `<imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective objectiveID="primary" satisfiedByMeasure="true">
              <imsss:minNormalizedMeasure>${formatReal107(toScaled(score))}</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
        </imsss:sequencing>`,
    }),
    adapter: 'SCORM2004Adapter',
    detect: 'findSCORM2004API',
    takesApi: true,
  },
  cmi5: {
    manifestFile: 'cmi5.xml',
    generate: (config) => generateCMI5Xml(config),
    adapter: 'CMI5Adapter',
    detect: 'hasCMI5LaunchParams',
    takesApi: false,
  },
  xapi: {
    manifestFile: 'tincan.xml',
    generate: (config) => generateTincanXml(config),
    adapter: 'XAPIAdapter',
    detect: 'hasXAPILaunchParams',
    takesApi: false,
  },
};

/**
 * Run the export process after Vite build completes.
 * Writes manifest XML into the build output, then packages into ZIP if needed.
 */
export async function runExport(
  projectRoot: string,
  outDir: string,
  config: ExportConfig,
): Promise<void> {
  const standard = config.export.standard;
  const slug = slugify(config.title) || 'tessera-course';
  const version = config.version || '1.0.0';
  const zipName = `${slug}-${version}.zip`;
  const zipPath = resolve(projectRoot, zipName);

  const profile = standardProfile(standard);
  if (!profile) return; // unknown standard: the validator rejects these upstream
  if (!profile.packaged) {
    const files = collectFiles(outDir);
    let totalSize = 0;
    for (const f of files) totalSize += statSync(resolve(outDir, f)).size;
    console.log(
      `✓ Web export: ${relative(projectRoot, outDir)}/ (${formatSize(totalSize)})`,
    );
    return;
  }

  const spec = LMS_BUILD[profile.id];

  writeFileSync(
    resolve(outDir, spec.manifestFile),
    spec.generate(config, outDir),
    'utf-8',
  );
  cleanOldZips(projectRoot, slug);
  const zipSize = await createZip(outDir, zipPath);
  console.log(`✓ ${profile.name} export: ${zipName} (${formatSize(zipSize)})`);
}
