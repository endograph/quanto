// @quantojs/anything/phone: `phoneNumber`, re-exported for convenience. On its own subpath, so its
// metadata (about 80 kB) is only in apps that import it, and an app can import it lazily:
// `import('@quantojs/anything/phone')`.

export { phoneNumber } from '@quantojs/libphonenumber';
export type { PhoneNumberOptions, PhoneNumberValue } from '@quantojs/libphonenumber';
