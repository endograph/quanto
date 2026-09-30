// Static dev server for the site. The pages are plain HTML, so this only maps
// URLs to files: `/` → index.html, `/play/` → play/index.html.
import { join, normalize } from 'node:path';

const root = import.meta.dir;
const port = Number(process.env.PORT ?? 4173);

Bun.serve({
  port,
  async fetch(req) {
    let path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = Bun.file(join(root, path));
    if (path.includes('..') || !(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'Cache-Control': 'no-store' } });
  },
});

console.log(`site: http://localhost:${port}/`);
