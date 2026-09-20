import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LMS_BUILD,
  generateCMI5Xml,
  generateTincanXml,
  createZip,
  runExport,
} from '../src/plugin/export.js';
import { mergeCourseConfig } from '../src/plugin/index.js';

let testRoot: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(tmpdir(), `tessera-export-test-${Date.now()}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createDistDir(root: string): string {
  const distDir = resolve(root, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, 'index.html'), '<html></html>', 'utf-8');
  mkdirSync(resolve(distDir, 'assets'), { recursive: true });
  writeFileSync(
    resolve(distDir, 'assets', 'main.js'),
    'console.log("hi")',
    'utf-8',
  );
  writeFileSync(resolve(distDir, 'assets', 'style.css'), 'body {}', 'utf-8');
  return distDir;
}

beforeEach(() => {
  testRoot = createTestDir();
});

afterEach(() => {
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {}
});

const scormXml = (
  standard: 'scorm12' | 'scorm2004',
  config: Parameters<typeof mergeCourseConfig>[0],
) =>
  LMS_BUILD[standard].generate(
    mergeCourseConfig(config),
    createDistDir(testRoot),
  );

// ---- SCORM 1.2 Manifest ----

describe('SCORM 1.2 manifest', () => {
  it('generates valid XML with correct schema', () => {
    const xml = scormXml('scorm12', { title: 'My Course' });

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain(
      'xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"',
    );
    expect(xml).toContain(
      'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"',
    );
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('adlcp:scormtype="sco"');
    expect(xml).not.toContain('imsss');
  });

  it('includes course title', () => {
    const xml = scormXml('scorm12', { title: 'My Course' });
    expect(xml).toContain('<title>My Course</title>');
  });

  it('escapes XML special characters in title', () => {
    const xml = scormXml('scorm12', { title: 'A & B <Course>' });
    expect(xml).toContain('<title>A &amp; B &lt;Course&gt;</title>');
  });

  it('falls back to "Untitled Course" for an empty title — the validator promises this fallback', () => {
    const xml = scormXml('scorm12', { title: '' });
    expect(xml).toContain('<title>Untitled Course</title>');
  });

  it('lists all files in dist/', () => {
    const xml = scormXml('scorm12', { title: 'Test' });

    expect(xml).toContain('<file href="index.html" />');
    expect(xml).toContain('<file href="assets/main.js" />');
    expect(xml).toContain('<file href="assets/style.css" />');
  });

  it('references index.html as resource href', () => {
    const xml = scormXml('scorm12', { title: 'Test' });
    expect(xml).toMatch(/href="index.html">/);
  });

  it('declares xsi namespace and schemaLocation pairs', () => {
    const xml = scormXml('scorm12', { title: 'Test' });
    expect(xml).toContain(
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    );
    expect(xml).toContain(
      'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd',
    );
    expect(xml).toContain(
      'http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd',
    );
  });

  it('declares passingScore as adlcp:masteryscore on the item', () => {
    const xml = scormXml('scorm12', {
      title: 'Test',
      scoring: { passingScore: 72.5 },
    });
    expect(xml).toMatch(
      /<item identifier="item-1" identifierref="res-1">\s*<title>Test<\/title>\s*<adlcp:masteryscore>72\.5<\/adlcp:masteryscore>\s*<\/item>/,
    );
  });

  it('defaults adlcp:masteryscore to 70', () => {
    const xml = scormXml('scorm12', { title: 'Test' });
    expect(xml).toContain('<adlcp:masteryscore>70</adlcp:masteryscore>');
  });

  it('omits adlcp:masteryscore in manual mode, even with a passingScore', () => {
    const xml = scormXml('scorm12', {
      title: 'Test',
      completion: { mode: 'manual' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('masteryscore');
  });
});

// ---- SCORM 2004 Manifest ----

describe('SCORM 2004 manifest', () => {
  it('generates valid XML with correct schema', () => {
    const xml = scormXml('scorm2004', { title: 'My Course' });

    expect(xml).toContain('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"');
    expect(xml).toContain('xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"');
    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
  });

  it('uses capital T in scormType', () => {
    const xml = scormXml('scorm2004', { title: 'Test' });
    expect(xml).toContain('adlcp:scormType="sco"');
  });

  it('does not declare adlcp:masteryscore', () => {
    const xml = scormXml('scorm2004', { title: 'Test' });
    expect(xml).not.toContain('masteryscore');
  });

  it('declares passingScore as the primary objective minNormalizedMeasure on the item', () => {
    const xml = scormXml('scorm2004', {
      title: 'Test',
      scoring: { passingScore: 72.5 },
    });
    expect(xml).toMatch(
      /<item [^>]*>\s*<title>Test<\/title>\s*<imsss:sequencing>/,
    );
    expect(xml).toContain(
      '<imsss:primaryObjective objectiveID="primary" satisfiedByMeasure="true">',
    );
    expect(xml).toContain(
      '<imsss:minNormalizedMeasure>0.725</imsss:minNormalizedMeasure>',
    );
  });

  it('defaults minNormalizedMeasure to 0.7', () => {
    const xml = scormXml('scorm2004', { title: 'Test' });
    expect(xml).toContain(
      '<imsss:minNormalizedMeasure>0.7</imsss:minNormalizedMeasure>',
    );
  });

  it('omits sequencing in manual mode, even with a passingScore', () => {
    const xml = scormXml('scorm2004', {
      title: 'Test',
      completion: { mode: 'manual' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('imsss:sequencing');
  });

  it('lists all files', () => {
    const xml = scormXml('scorm2004', { title: 'Test' });
    expect(xml).toContain('<file href="index.html" />');
    expect(xml).toContain('<file href="assets/main.js" />');
  });

  it('declares xsi namespace and schemaLocation pairs', () => {
    const xml = scormXml('scorm2004', { title: 'Test' });
    expect(xml).toContain(
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    );
    expect(xml).toContain(
      'http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd',
    );
    expect(xml).toContain(
      'http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd',
    );
    expect(xml).toContain('xmlns:imsss="http://www.imsglobal.org/xsd/imsss"');
    expect(xml).toContain('http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd');
  });
});

// ---- CMI5 XML ----

describe('generateCMI5Xml', () => {
  const cmi5Xml = (config: Parameters<typeof mergeCourseConfig>[0]) =>
    generateCMI5Xml(mergeCourseConfig(config));

  it('generates valid XML with course structure', () => {
    const xml = cmi5Xml({
      title: 'My Course',
      description: 'A great course',
      scoring: { passingScore: 80 },
    });

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain(
      'xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"',
    );
    expect(xml).toContain('<langstring lang="en-US">My Course</langstring>');
    expect(xml).toContain(
      '<langstring lang="en-US">A great course</langstring>',
    );
  });

  it('sets masteryScore from passingScore, separated from the preceding attribute', () => {
    const xml = cmi5Xml({
      title: 'Test',
      scoring: { passingScore: 80 },
    });
    expect(xml).toContain('moveOn="Completed" masteryScore="0.8">');
  });

  it('defaults masteryScore to 0.7', () => {
    const xml = cmi5Xml({ title: 'Test' });
    expect(xml).toContain('masteryScore="0.7"');
  });

  it('omits masteryScore in manual mode', () => {
    const xml = cmi5Xml({ title: 'Test', completion: { mode: 'manual' } });
    expect(xml).not.toContain('masteryScore');
    expect(xml).toContain('moveOn="Completed">');
  });

  it('falls back to "Untitled Course" for an empty title — the validator promises this fallback', () => {
    const xml = cmi5Xml({ title: '' });
    expect(xml).toContain(
      '<langstring lang="en-US">Untitled Course</langstring>',
    );
  });

  it('includes URN IRIs for course and AU ids', () => {
    const xml = cmi5Xml({ title: 'Test' });
    // cmi5 / xs:anyURI requires course/AU ids to be valid IRIs. We emit
    // `urn:tessera:course:<hex>` and `urn:tessera:au:<hex>` — matching the
    // RFC 8141 URN syntax with a stable hash so re-exports keep the same ids.
    const urnPattern = /urn:tessera:(course|au):[0-9a-f]{32}/g;
    const ids = xml.match(urnPattern);
    expect(ids).not.toBeNull();
    expect(ids!.length).toBeGreaterThanOrEqual(2);
    expect(ids!.some((s) => s.startsWith('urn:tessera:course:'))).toBe(true);
    expect(ids!.some((s) => s.startsWith('urn:tessera:au:'))).toBe(true);
    // Course and AU must have different ids.
    const courseId = ids!.find((s) => s.startsWith('urn:tessera:course:'));
    const auId = ids!.find((s) => s.startsWith('urn:tessera:au:'));
    expect(courseId).not.toBe(auId);
  });

  it('derives distinct ids from the course id, not the title', () => {
    const idOf = (config: Parameters<typeof cmi5Xml>[0]) =>
      cmi5Xml(config).match(/urn:tessera:course:[0-9a-f]{32}/)![0];
    // Same title, different id → different activity id (no LRS record clash).
    expect(idOf({ title: 'Onboarding', id: 'urn:uuid:a' })).not.toBe(
      idOf({ title: 'Onboarding', id: 'urn:uuid:b' }),
    );
    // Same id → stable across re-export.
    expect(idOf({ title: 'Onboarding', id: 'urn:uuid:a' })).toBe(
      idOf({ title: 'Renamed', id: 'urn:uuid:a' }),
    );
    // Whitespace-only id is treated as no id (matches the WebAdapter).
    expect(idOf({ title: 'Onboarding', id: '   ' })).toBe(
      idOf({ title: 'Onboarding' }),
    );
  });

  it('defaults moveOn to Completed when completion mode is percentage', () => {
    const xml = cmi5Xml({
      title: 'Test',
      completion: { mode: 'percentage' },
    });
    expect(xml).toContain('moveOn="Completed"');
  });

  it('uses moveOn=CompletedAndPassed for graded (quiz-mode) courses', () => {
    // A learner who finishes a graded course without passing the quiz
    // should NOT be granted satisfaction. cmi5 §13.1.4 — CompletedAndPassed
    // requires both Completed AND Passed before the LMS rolls up.
    const xml = cmi5Xml({
      title: 'Test',
      completion: { mode: 'quiz' },
    });
    expect(xml).toContain('moveOn="CompletedAndPassed"');
  });

  it('defaults moveOn to Completed when no completion config supplied', () => {
    const xml = cmi5Xml({ title: 'Test' });
    expect(xml).toContain('moveOn="Completed"');
  });

  it('emits launchMethod attribute on <au> (defaults to AnyWindow)', () => {
    // The cmi5 CourseStructure XSD requires `launchMethod` on every
    // <au>; importers that validate against the schema reject the
    // manifest without it.
    const xml = cmi5Xml({ title: 'Test' });
    expect(xml).toMatch(/<au\b[^>]*\blaunchMethod="AnyWindow"/);
  });

  it('emits url as a child element of <au>, not an attribute', () => {
    // cmi5 CourseStructure.xsd requires <au> to contain <url> as a child
    // element (between <description> and any <objectives>). Emitting
    // `url="index.html"` as an attribute makes the manifest fail XSD
    // validation in conformant LMS importers (e.g., SCORM Cloud).
    const xml = cmi5Xml({ title: 'Test' });
    expect(xml).toContain('<url>index.html</url>');
    expect(xml).not.toMatch(/<au\b[^>]*\burl=/);
  });

  it('escapes XML special characters', () => {
    const xml = cmi5Xml({
      title: 'A & B',
      description: '<script>alert("xss")</script>',
    });
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>');
  });
});

describe('generateTincanXml', () => {
  it('emits a tincan.xml with a stable activity id and the title', () => {
    const xml = generateTincanXml({ title: 'My Course' } as any);
    expect(xml).toContain('xmlns="http://projecttincan.com/tincan.xsd"');
    expect(xml).toMatch(
      /<activity id="urn:tessera:au:[0-9a-f]{32}" type="http:\/\/adlnet\.gov\/expapi\/activities\/course">/,
    );
    expect(xml).toContain('My Course');
    expect(xml).toContain('<launch lang="en-US">index.html</launch>');
    // No xAPI version field exists in the tincan schema.
    expect(xml).not.toMatch(/1\.0\.3|2\.0/);
  });

  it('is identical regardless of which xapi version will run', () => {
    const a = generateTincanXml({ title: 'Same' } as any);
    const b = generateTincanXml({ title: 'Same' } as any);
    expect(a).toBe(b);
  });
});

// ---- ZIP Packaging ----

describe('createZip', () => {
  it('creates a zip file from dist directory', async () => {
    const distDir = createDistDir(testRoot);
    const zipPath = resolve(testRoot, 'output.zip');
    const size = await createZip(distDir, zipPath);

    expect(existsSync(zipPath)).toBe(true);
    expect(size).toBeGreaterThan(0);
  });
});

// ---- runExport Integration ----

describe('runExport', () => {
  it('web export does not create a zip', async () => {
    await runExport(
      testRoot,
      createDistDir(testRoot),
      mergeCourseConfig({
        title: 'Test',
        version: '1.0.0',
        export: { standard: 'web' },
      }),
    );
    // No zip should exist
    const files = readdirSync(testRoot);
    expect(files.filter((f) => f.endsWith('.zip'))).toHaveLength(0);
  });

  it('scorm12 export creates imsmanifest.xml and zip', async () => {
    await runExport(
      testRoot,
      createDistDir(testRoot),
      mergeCourseConfig({
        title: 'Test Course',
        version: '2.0.0',
        export: { standard: 'scorm12' },
      }),
    );

    // Check manifest was written to dist
    expect(existsSync(resolve(testRoot, 'dist', 'imsmanifest.xml'))).toBe(true);

    // Check zip was created
    const zipPath = resolve(testRoot, 'test-course-2.0.0.zip');
    expect(existsSync(zipPath)).toBe(true);

    // Manifest content is valid
    const manifest = readFileSync(
      resolve(testRoot, 'dist', 'imsmanifest.xml'),
      'utf-8',
    );
    expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
  });

  it('scorm2004 export creates imsmanifest.xml and zip', async () => {
    await runExport(
      testRoot,
      createDistDir(testRoot),
      mergeCourseConfig({
        title: 'Test Course',
        version: '1.0.0',
        export: { standard: 'scorm2004' },
      }),
    );

    expect(existsSync(resolve(testRoot, 'dist', 'imsmanifest.xml'))).toBe(true);
    expect(existsSync(resolve(testRoot, 'test-course-1.0.0.zip'))).toBe(true);

    const manifest = readFileSync(
      resolve(testRoot, 'dist', 'imsmanifest.xml'),
      'utf-8',
    );
    expect(manifest).toContain(
      '<schemaversion>2004 4th Edition</schemaversion>',
    );
  });

  it('cmi5 export creates cmi5.xml and zip', async () => {
    await runExport(testRoot, createDistDir(testRoot), {
      title: 'Test Course',
      version: '1.0.0',
      scoring: { passingScore: 80 },
      export: { standard: 'cmi5' },
    });

    expect(existsSync(resolve(testRoot, 'dist', 'cmi5.xml'))).toBe(true);
    expect(existsSync(resolve(testRoot, 'test-course-1.0.0.zip'))).toBe(true);

    const xml = readFileSync(resolve(testRoot, 'dist', 'cmi5.xml'), 'utf-8');
    expect(xml).toContain('masteryScore="0.8"');
  });

  it('uses slugified title and version for zip filename', async () => {
    await runExport(
      testRoot,
      createDistDir(testRoot),
      mergeCourseConfig({
        title: 'My Amazing Course!',
        version: '3.2.1',
        export: { standard: 'scorm12' },
      }),
    );

    expect(existsSync(resolve(testRoot, 'my-amazing-course-3.2.1.zip'))).toBe(
      true,
    );
  });

  it('writes the manifest into a custom outDir and zips it', async () => {
    const outDir = resolve(testRoot, 'build');
    mkdirSync(outDir);
    writeFileSync(resolve(outDir, 'index.html'), '<html></html>', 'utf-8');
    await runExport(
      testRoot,
      outDir,
      mergeCourseConfig({
        title: 'Test Course',
        version: '1.0.0',
        export: { standard: 'scorm12' },
      }),
    );

    const manifest = readFileSync(resolve(outDir, 'imsmanifest.xml'), 'utf-8');
    expect(manifest).toContain('<file href="index.html" />');
    expect(existsSync(resolve(testRoot, 'dist'))).toBe(false);
    expect(existsSync(resolve(testRoot, 'test-course-1.0.0.zip'))).toBe(true);
  });
});

describe('pass mark follows success.from, not completion.mode', () => {
  it('omits adlcp:masteryscore under manual completion, even with a quiz verdict', () => {
    const xml = scormXml('scorm12', {
      title: 'Test',
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('masteryscore');
  });

  it('omits minNormalizedMeasure under manual completion, even with a quiz verdict', () => {
    const xml = scormXml('scorm2004', {
      title: 'Test',
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('minNormalizedMeasure');
  });

  it('declares adlcp:masteryscore under a percentage course with a quiz verdict', () => {
    const xml = scormXml('scorm12', {
      title: 'Test',
      completion: { mode: 'percentage' },
      success: { from: 'quiz' },
      scoring: { passingScore: 80 },
    });
    expect(xml).toContain('<adlcp:masteryscore>80</adlcp:masteryscore>');
  });

  it('omits the SCORM 1.2 pass mark under success.from "none"', () => {
    const xml = scormXml('scorm12', {
      title: 'Test',
      completion: { mode: 'percentage' },
      success: { from: 'none' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('masteryscore');
  });

  it('omits the SCORM 2004 pass mark under success.from "fixed"', () => {
    const xml = scormXml('scorm2004', {
      title: 'Test',
      completion: { mode: 'percentage' },
      success: { from: 'fixed', status: 'passed' },
      scoring: { passingScore: 80 },
    });
    expect(xml).not.toContain('minNormalizedMeasure');
  });
});
