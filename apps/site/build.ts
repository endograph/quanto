// Builds the static site into dist/: the HTML with the version stamped in, the CSS and favicon as they
// are, and the bundled scripts.
import { cp, mkdir, rm } from 'node:fs/promises';
import { bundle, stamp } from './bundle';

const dir = import.meta.dir;
const out = `${dir}/dist`;

await rm(out, { recursive: true, force: true });
for (const dir of ['demo', 'play']) await mkdir(`${out}/${dir}`, { recursive: true });
for (const file of ['quanto.css', 'omni.css', 'favicon.svg']) await cp(`${dir}/${file}`, `${out}/${file}`);
for (const page of ['index.html', 'demo/index.html', 'play/index.html']) await Bun.write(`${out}/${page}`, stamp(await Bun.file(`${dir}/${page}`).text()));
for (const [name, blob] of await bundle(true)) await Bun.write(`${out}/${name}`, blob);

console.log(`site: built ${out}`);
