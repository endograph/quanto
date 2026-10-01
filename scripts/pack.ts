// Packs the published packages into a directory and checks the tarballs, so CI tests exactly what
// `publish.yml` publishes. Run with `bun scripts/pack.ts <out-dir>`.
//
// Checks: every published package has the same version (quanto, quanto-datetime and quanto-react
// release in lockstep), and no tarball still contains a `workspace:` range or a quanto range other than
// `^<version>`. Bun fills `workspace:^` in from bun.lock, so a stale lockfile after a version bump
// would otherwise publish a wrong peer range.

import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PACKAGES = ['packages/quanto', 'packages/datetime', 'packages/react'];
const out = resolve(process.argv[2] ?? 'packs');
mkdirSync(out, { recursive: true });

const fail = (message: string): never => {
  console.error(`pack: ${message}`);
  process.exit(1);
};

const manifests = await Promise.all(PACKAGES.map(async (dir) => ({ dir, json: await Bun.file(join(dir, 'package.json')).json() })));
const version: string = manifests[0]!.json.version;
for (const { json } of manifests) if (json.version !== version) fail(`${json.name} is ${json.version}, but quanto is ${version}. Release them together.`);

for (const { dir, json } of manifests) {
  const packed = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', out], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
  if (packed.exitCode !== 0) fail(`bun pm pack failed in ${dir}`);
  const tarball = join(out, `${json.name}-${version}.tgz`);
  const manifest = JSON.parse(Bun.spawnSync(['tar', '-xOzf', tarball, 'package/package.json']).stdout.toString());
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries<string>(manifest[field] ?? {})) {
      if (range.startsWith('workspace:')) fail(`${tarball} still has ${field}.${name} = "${range}".`);
      if (name === 'quanto' && range !== `^${version}`) {
        fail(`${tarball} has ${field}.quanto = "${range}", expected "^${version}". Run bun install after a version bump.`);
      }
    }
  }
}

console.log(readdirSync(out).filter((f) => f.endsWith('.tgz')).map((f) => join(out, f)).join('\n'));
