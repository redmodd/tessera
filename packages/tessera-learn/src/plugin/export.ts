import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import archiver from 'archiver';
import { slugify } from '../runtime/slugify.js';

// ---------- Types ----------

interface ExportConfig {
  title: string;
  description?: string;
  version?: string;
  scoring?: { passingScore?: number };
  completion?: { mode?: 'quiz' | 'percentage' };
  export?: { standard?: string };
}

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Manifest Generators ----------

export function generateSCORM12Manifest(
  config: ExportConfig,
  distDir: string
): string {
  const title = escapeXml(config.title || 'Tessera Course');
  const files = collectFiles(distDir);
  const fileElements = files
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="tessera-course" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
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
    <resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileElements}
    </resource>
  </resources>
</manifest>`;
}

export function generateSCORM2004Manifest(
  config: ExportConfig,
  distDir: string
): string {
  const title = escapeXml(config.title || 'Tessera Course');
  const files = collectFiles(distDir);
  const fileElements = files
    .map((f) => `      <file href="${escapeXml(f)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="tessera-course" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
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
    <resource identifier="res-1" type="webcontent" adlcp:scormType="sco" href="index.html">
${fileElements}
    </resource>
  </resources>
</manifest>`;
}

export function generateCMI5Xml(config: ExportConfig): string {
  const title = escapeXml(config.title || 'Tessera Course');
  const description = escapeXml(config.description || '');
  // Derive stable IDs from the course title so they survive rebuilds without
  // orphaning existing learner records in the LRS.
  const courseId = stableUrn('course', `tessera-course:${config.title || ''}`);
  const auId = stableUrn('au', `tessera-au:${config.title || ''}`);
  const masteryScore = (config.scoring?.passingScore ?? 70) / 100;
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
  <au id="${auId}" url="index.html" moveOn="${moveOn}" masteryScore="${masteryScore}">
    <title><langstring lang="en-US">${title}</langstring></title>
    <description><langstring lang="en-US">${description}</langstring></description>
  </au>
</courseStructure>`;
}

// ---------- ZIP Packaging ----------

export async function createZip(
  distDir: string,
  outputPath: string
): Promise<number> {
  return new Promise((res, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res(archive.pointer());
    });
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
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
        try { unlinkSync(resolve(projectRoot, f)); } catch {}
      }
    }
  } catch {}
}

export async function runExport(
  projectRoot: string,
  config: ExportConfig
): Promise<void> {
  const distDir = resolve(projectRoot, 'dist');
  const standard = config.export?.standard || 'web';
  const slug = slugify(config.title || 'tessera-course') || 'tessera-course';
  const version = config.version || '1.0.0';
  const zipName = `${slug}-${version}.zip`;
  const zipPath = resolve(projectRoot, zipName);

  switch (standard) {
    case 'web': {
      // Compute dist size
      const files = collectFiles(distDir);
      let totalSize = 0;
      for (const f of files) {
        totalSize += statSync(resolve(distDir, f)).size;
      }
      console.log(`✓ Web export: dist/ (${formatSize(totalSize)})`);
      break;
    }

    case 'scorm12': {
      const manifest = generateSCORM12Manifest(config, distDir);
      writeFileSync(resolve(distDir, 'imsmanifest.xml'), manifest, 'utf-8');
      cleanOldZips(projectRoot, slug);
      const zipSize = await createZip(distDir, zipPath);
      console.log(
        `✓ SCORM 1.2 export: ${zipName} (${formatSize(zipSize)})`
      );
      break;
    }

    case 'scorm2004': {
      const manifest = generateSCORM2004Manifest(config, distDir);
      writeFileSync(resolve(distDir, 'imsmanifest.xml'), manifest, 'utf-8');
      cleanOldZips(projectRoot, slug);
      const zipSize = await createZip(distDir, zipPath);
      console.log(
        `✓ SCORM 2004 export: ${zipName} (${formatSize(zipSize)})`
      );
      break;
    }

    case 'cmi5': {
      const xml = generateCMI5Xml(config);
      writeFileSync(resolve(distDir, 'cmi5.xml'), xml, 'utf-8');
      cleanOldZips(projectRoot, slug);
      const zipSize = await createZip(distDir, zipPath);
      console.log(`✓ CMI5 export: ${zipName} (${formatSize(zipSize)})`);
      break;
    }
  }
}
