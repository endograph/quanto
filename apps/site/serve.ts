// Dev server for the site. Static files come straight from this folder; the page scripts are bundled
// fresh on every request, so edits to the site or to the packages show up on reload.
import { join, normalize } from 'node:path';
import { bundle } from './bundle';

const root = import.meta.dir;
const port = Number(process.env.PORT ?? 4173);
const headers = { 'Cache-Control': 'no-store' };

Bun.serve({
  port,
  async fetch(req) {
    let path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.endsWith('/')) path += 'index.html';
    if (path.endsWith('.js')) {
      const script = (await bundle(false)).get(path.slice(1));
      if (script) return new Response(script, { headers: { ...headers, 'Content-Type': 'text/javascript' } });
    }
    const file = Bun.file(join(root, path));
    if (path.startsWith('/src/') || !(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file, { headers });
  },
});

console.log(`site: http://localhost:${port}/`);
