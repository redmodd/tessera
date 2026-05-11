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
  generateSCORM12Manifest,
  generateSCORM2004Manifest,
  generateCMI5Xml,
  createZip,
  runExport,
} from '../src/plugin/export.js';

let testRoot: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(
    tmpdir(),
    `tessera-export-test-${Date.now()}-${counter}`
  );
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
    'utf-8'
  );
  writeFileSync(
    resolve(distDir, 'assets', 'style.css'),
    'body {}',
    'utf-8'
  );
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

// ---- SCORM 1.2 Manifest ----

describe('generateSCORM12Manifest', () => {
  it('generates valid XML with correct schema', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM12Manifest({ title: 'My Course' }, distDir);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain(
      'xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"'
    );
    expect(xml).toContain(
      'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"'
    );
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('adlcp:scormtype="sco"');
  });

  it('includes course title', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM12Manifest({ title: 'My Course' }, distDir);
    expect(xml).toContain('<title>My Course</title>');
  });

  it('escapes XML special characters in title', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM12Manifest(
      { title: 'A & B <Course>' },
      distDir
    );
    expect(xml).toContain(
      '<title>A &amp; B &lt;Course&gt;</title>'
    );
  });

  it('lists all files in dist/', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM12Manifest({ title: 'Test' }, distDir);

    expect(xml).toContain('<file href="index.html" />');
    expect(xml).toContain('<file href="assets/main.js" />');
    expect(xml).toContain('<file href="assets/style.css" />');
  });

  it('references index.html as resource href', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM12Manifest({ title: 'Test' }, distDir);
    expect(xml).toMatch(/href="index.html">/);
  });
});

// ---- SCORM 2004 Manifest ----

describe('generateSCORM2004Manifest', () => {
  it('generates valid XML with correct schema', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM2004Manifest({ title: 'My Course' }, distDir);

    expect(xml).toContain(
      'xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"'
    );
    expect(xml).toContain(
      'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"'
    );
    expect(xml).toContain(
      '<schemaversion>2004 4th Edition</schemaversion>'
    );
  });

  it('uses capital T in scormType', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM2004Manifest({ title: 'Test' }, distDir);
    expect(xml).toContain('adlcp:scormType="sco"');
  });

  it('lists all files', () => {
    const distDir = createDistDir(testRoot);
    const xml = generateSCORM2004Manifest({ title: 'Test' }, distDir);
    expect(xml).toContain('<file href="index.html" />');
    expect(xml).toContain('<file href="assets/main.js" />');
  });
});

// ---- CMI5 XML ----

describe('generateCMI5Xml', () => {
  it('generates valid XML with course structure', () => {
    const xml = generateCMI5Xml({
      title: 'My Course',
      description: 'A great course',
      scoring: { passingScore: 80 },
    });

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain(
      'xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"'
    );
    expect(xml).toContain(
      '<langstring lang="en-US">My Course</langstring>'
    );
    expect(xml).toContain(
      '<langstring lang="en-US">A great course</langstring>'
    );
  });

  it('sets masteryScore from passingScore', () => {
    const xml = generateCMI5Xml({
      title: 'Test',
      scoring: { passingScore: 80 },
    });
    expect(xml).toContain('masteryScore="0.8"');
  });

  it('defaults masteryScore to 0.7', () => {
    const xml = generateCMI5Xml({ title: 'Test' });
    expect(xml).toContain('masteryScore="0.7"');
  });

  it('includes URN IRIs for course and AU ids', () => {
    const xml = generateCMI5Xml({ title: 'Test' });
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

  it('defaults moveOn to Completed when completion mode is percentage', () => {
    const xml = generateCMI5Xml({
      title: 'Test',
      completion: { mode: 'percentage' },
    });
    expect(xml).toContain('moveOn="Completed"');
  });

  it('uses moveOn=CompletedAndPassed for graded (quiz-mode) courses', () => {
    // A learner who finishes a graded course without passing the quiz
    // should NOT be granted satisfaction. cmi5 §13.1.4 — CompletedAndPassed
    // requires both Completed AND Passed before the LMS rolls up.
    const xml = generateCMI5Xml({
      title: 'Test',
      completion: { mode: 'quiz' },
    });
    expect(xml).toContain('moveOn="CompletedAndPassed"');
  });

  it('defaults moveOn to Completed when no completion config supplied', () => {
    const xml = generateCMI5Xml({ title: 'Test' });
    expect(xml).toContain('moveOn="Completed"');
  });

  it('emits url as a child element of <au>, not an attribute', () => {
    // cmi5 CourseStructure.xsd requires <au> to contain <url> as a child
    // element (between <description> and any <objectives>). Emitting
    // `url="index.html"` as an attribute makes the manifest fail XSD
    // validation in conformant LMS importers (e.g., SCORM Cloud).
    const xml = generateCMI5Xml({ title: 'Test' });
    expect(xml).toContain('<url>index.html</url>');
    expect(xml).not.toMatch(/<au\b[^>]*\burl=/);
  });

  it('escapes XML special characters', () => {
    const xml = generateCMI5Xml({
      title: 'A & B',
      description: '<script>alert("xss")</script>',
    });
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>');
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
    createDistDir(testRoot);
    await runExport(testRoot, {
      title: 'Test',
      version: '1.0.0',
      export: { standard: 'web' },
    });
    // No zip should exist
    const files = readdirSync(testRoot);
    expect(files.filter((f) => f.endsWith('.zip'))).toHaveLength(0);
  });

  it('scorm12 export creates imsmanifest.xml and zip', async () => {
    createDistDir(testRoot);
    await runExport(testRoot, {
      title: 'Test Course',
      version: '2.0.0',
      export: { standard: 'scorm12' },
    });

    // Check manifest was written to dist
    expect(
      existsSync(resolve(testRoot, 'dist', 'imsmanifest.xml'))
    ).toBe(true);

    // Check zip was created
    const zipPath = resolve(testRoot, 'test-course-2.0.0.zip');
    expect(existsSync(zipPath)).toBe(true);

    // Manifest content is valid
    const manifest = readFileSync(
      resolve(testRoot, 'dist', 'imsmanifest.xml'),
      'utf-8'
    );
    expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
  });

  it('scorm2004 export creates imsmanifest.xml and zip', async () => {
    createDistDir(testRoot);
    await runExport(testRoot, {
      title: 'Test Course',
      version: '1.0.0',
      export: { standard: 'scorm2004' },
    });

    expect(
      existsSync(resolve(testRoot, 'dist', 'imsmanifest.xml'))
    ).toBe(true);
    expect(
      existsSync(resolve(testRoot, 'test-course-1.0.0.zip'))
    ).toBe(true);

    const manifest = readFileSync(
      resolve(testRoot, 'dist', 'imsmanifest.xml'),
      'utf-8'
    );
    expect(manifest).toContain(
      '<schemaversion>2004 4th Edition</schemaversion>'
    );
  });

  it('cmi5 export creates cmi5.xml and zip', async () => {
    createDistDir(testRoot);
    await runExport(testRoot, {
      title: 'Test Course',
      version: '1.0.0',
      scoring: { passingScore: 80 },
      export: { standard: 'cmi5' },
    });

    expect(existsSync(resolve(testRoot, 'dist', 'cmi5.xml'))).toBe(
      true
    );
    expect(
      existsSync(resolve(testRoot, 'test-course-1.0.0.zip'))
    ).toBe(true);

    const xml = readFileSync(
      resolve(testRoot, 'dist', 'cmi5.xml'),
      'utf-8'
    );
    expect(xml).toContain('masteryScore="0.8"');
  });

  it('uses slugified title and version for zip filename', async () => {
    createDistDir(testRoot);
    await runExport(testRoot, {
      title: 'My Amazing Course!',
      version: '3.2.1',
      export: { standard: 'scorm12' },
    });

    expect(
      existsSync(resolve(testRoot, 'my-amazing-course-3.2.1.zip'))
    ).toBe(true);
  });
});
