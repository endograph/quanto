// The codec sources the bundler provides (see bundle.ts).

declare module 'codec-sources' {
  /** Each editable codec's source, by codec id. */
  const sources: Readonly<Record<string, string>>;
  export default sources;
}

declare module 'codec-sources/ids' {
  /** The ids of the codecs the playground can edit. */
  const ids: readonly string[];
  export default ids;
}
