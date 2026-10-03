// PRD-MOD-008: internal identifiers are UUIDv7.
// Layout follows RFC 9562: 48-bit Unix time in milliseconds, version 7, variant 10, random bits for the rest.
// Ids made in different milliseconds sort in time order. Ids made within one millisecond are not ordered.

const HEX = '0123456789abcdef';

export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);

  const ms = Date.now();
  // Arithmetic, not bit shifts: shifts would cut the timestamp to 32 bits.
  view.setUint16(0, Math.floor(ms / 2 ** 32));
  view.setUint32(2, ms % 2 ** 32);
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

  let hex = '';
  for (const byte of bytes) {
    hex += HEX.charAt(byte >> 4) + HEX.charAt(byte & 0x0f);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
