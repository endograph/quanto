// The published packages, in publish order: quanto first, since every other package's peer dependency
// points at it, and @quantojs/anything last, since it depends on the codec packages. `pack.ts`,
// `release.ts` and, through the `publish.txt` that `pack.ts` writes, `publish.yml` all read this list.
export const PACKAGES = [
  'packages/quanto',
  'packages/common',
  'packages/datetime',
  'packages/geo',
  'packages/music',
  'packages/sizes',
  'packages/libphonenumber',
  'packages/libpostal',
  'packages/react',
  'packages/anything',
];
