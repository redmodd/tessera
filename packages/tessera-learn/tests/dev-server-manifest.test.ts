import { it, expect, onTestFinished, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, normalizePath } from 'vite';
import { tesseraPlugin } from '../src/plugin/index.js';
import { tempDir, writeLessonPage } from './helpers.js';

// Runs against Vite's own plugins: vite:import-glob asks for a reload of its
// own when a page is added, which a faked environment cannot show.
it('reloads the client once for a new page, with the manifest that lists it', async () => {
  const root = tempDir();
  writeFileSync(
    join(root, 'course.config.js'),
    `export default { title: "T", export: { standard: "web" } };`,
  );
  writeLessonPage(root);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [tesseraPlugin()],
    server: { watch: null },
  });
  onTestFinished(() => server.close());
  const { client } = server.environments;
  const manifest = async () =>
    (await client.transformRequest('/virtual:tessera-manifest'))?.code;
  const loaded = await manifest();
  await client.transformRequest('/virtual:tessera-pages');
  const reloads: (string | undefined)[] = [];
  vi.spyOn(client.hot, 'send').mockImplementation(async (payload: unknown) => {
    if ((payload as { type?: string }).type === 'full-reload') {
      reloads.push(await manifest());
    }
  });

  // Vite resolves symlinks in the root, and the watcher reports files under it.
  const added = join(
    server.config.root,
    'pages/01-section/01-lesson/added.svelte',
  );
  writeFileSync(added, '<h1>Added</h1>');
  server.watcher.emit('add', normalizePath(added));

  await vi.waitFor(() => expect(reloads).toHaveLength(1));
  await new Promise((done) => setTimeout(done, 150));
  expect(reloads).toHaveLength(1);
  expect(reloads[0]).not.toBe(loaded);
});
