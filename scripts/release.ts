// Releases quanto and every @quantojs package at one version. Run with `bun scripts/release.ts 0.4.0`, and
// add `--push` to push the commit and tag, which starts `publish.yml`. Without it, the script prints the
// push command, so the release commit can be looked at first.
//
// On main, up to date with origin, it bumps every package in `packages.ts`, runs `bun install` (which
// fills `workspace:^` in from the lockfile), checks, builds, packs and lints the tarballs as CI does, then
// commits the bump and tags it `v<version>`. Only the package.json files and bun.lock are committed, so
// other uncommitted work is left alone; those files must be clean. If a step fails, the bump is undone.

import { join } from 'node:path';
import { PACKAGES } from './packages';

const args = process.argv.slice(2);
const push = args.includes('--push');
const version = args.find((a) => !a.startsWith('--'));

const fail = (message: string): never => {
  console.error(`release: ${message}`);
  process.exit(1);
};

/** Runs a command with its output shown, and fails the release if it fails. */
const run = (cmd: string[]) => {
  console.log(`\n$ ${cmd.join(' ')}`);
  if (Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' }).exitCode !== 0) throw new Error(`${cmd.join(' ')} failed`);
};
/** Runs a command quietly and returns its trimmed output. */
const read = (cmd: string[]) => {
  const result = Bun.spawnSync(cmd);
  if (result.exitCode !== 0) fail(`${cmd.join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
};

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) fail('usage: bun scripts/release.ts <major.minor.patch> [--push]');
const tag = `v${version}`;
const files = [...PACKAGES.map((dir) => join(dir, 'package.json')), 'bun.lock'];

const current: string = (await Bun.file('packages/quanto/package.json').json()).version;
if (Bun.semver.order(version!, current) !== 1) fail(`${version} isn't after the current version, ${current}.`);
if (read(['git', 'branch', '--show-current']) !== 'main') fail('release from main.');
read(['git', 'fetch', '--quiet', '--tags', 'origin']);
if (read(['git', 'rev-list', '--count', 'HEAD..origin/main']) !== '0') fail('main is behind origin/main. Pull first.');
if (read(['git', 'tag', '--list', tag]) !== '') fail(`the tag ${tag} already exists.`);
const dirty = read(['git', 'status', '--porcelain', '--', ...files]);
if (dirty) fail(`these must be committed or reverted first:\n${dirty}`);

try {
  for (const file of files.filter((f) => f.endsWith('package.json'))) {
    const text = await Bun.file(file).text();
    const bumped = text.replace(`"version": "${current}"`, `"version": "${version}"`);
    if (bumped === text) throw new Error(`${file} isn't at ${current}.`);
    await Bun.write(file, bumped);
  }
  run(['bun', 'install']);
  run(['bun', 'run', 'check']);
  run(['bun', 'run', 'build']);
  const packs = read(['mktemp', '-d']);
  run(['bun', 'scripts/pack.ts', packs]);
  for (const line of (await Bun.file(join(packs, 'publish.txt')).text()).trim().split('\n')) {
    const tarball = line.split(' ')[1]!;
    run(['bunx', 'publint@0.3.24', tarball]);
    run(['bunx', '@arethetypeswrong/cli@0.18.5', tarball, '--profile', 'esm-only']);
  }
} catch (error) {
  Bun.spawnSync(['git', 'checkout', '--', ...files]);
  fail(`${(error as Error).message}. The version bump was undone.`);
}

run(['git', 'add', '--', ...files]);
run(['git', 'commit', '--quiet', '-m', `chore: release ${tag}`, '--', ...files]);
run(['git', 'tag', tag]);

const pushCmd = ['git', 'push', '--atomic', 'origin', 'main', tag];
if (push) {
  run(pushCmd);
  console.log(`\nPushed ${tag}. publish.yml publishes it: https://github.com/endograph/quanto/actions/workflows/publish.yml`);
} else {
  console.log(`\nCommitted and tagged ${tag}. To publish, push both:\n\n  ${pushCmd.join(' ')}\n`);
}
