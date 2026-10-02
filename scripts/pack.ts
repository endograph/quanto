// Packs the published packages into a directory and checks the tarballs, so CI tests exactly what
// `publish.yml` publishes. Run with `bun scripts/pack.ts <out-dir>`. Writes `publish.txt` there too: one
// `<name> <tarball>` line per package, in publish order, which `publish.yml` publishes from.
//
// Checks: every published package has the same version (quanto and the @quantojs packages release in
// lockstep), and no tarball still contains a `workspace:` range, or a range on quanto or another
// @quantojs package other than `^<version>`. Bun fills `workspace:^` in from bun.lock, so a stale
// lockfile after a version bump would otherwise publish a wrong range.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PACKAGES } from './packages';

const out = resolve(process.argv[2] ?? 'packs');
mkdirSync(out, { recursive: true });

const fail = (message: string): never => {
  console.error(`pack: ${message}`);
  process.exit(1);
};

const manifests = await Promise.all(PACKAGES.map(async (dir) => ({ dir, json: await Bun.file(join(dir, 'package.json')).json() })));
const version: string = manifests[0]!.json.version;
for (const { json } of manifests) if (json.version !== version) fail(`${json.name} is ${json.version}, but quanto is ${version}. Release them together.`);

const lines: string[] = [];
for (const { dir, json } of manifests) {
  const packed = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', out], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
  if (packed.exitCode !== 0) fail(`bun pm pack failed in ${dir}`);
  // bun names a scoped package's tarball without the @ and with - for the /: quantojs-datetime-0.1.0.tgz.
  const tarball = join(out, `${json.name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`);
  const manifest = JSON.parse(Bun.spawnSync(['tar', '-xOzf', tarball, 'package/package.json']).stdout.toString());
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries<string>(manifest[field] ?? {})) {
      if (range.startsWith('workspace:')) fail(`${tarball} still has ${field}.${name} = "${range}".`);
      if ((name === 'quanto' || name.startsWith('@quantojs/')) && range !== `^${version}`) {
        fail(`${tarball} has ${field}.${name} = "${range}", expected "^${version}". Run bun install after a version bump.`);
      }
    }
  }
  lines.push(`${json.name} ${tarball}`);
}

writeFileSync(join(out, 'publish.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
