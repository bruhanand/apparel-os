// The names of the counter's IndexedDB databases (offline-counter 5.3; S1-F12-T01): one index database saying which
// device identity this browser profile holds per Organisation, and one database per identity, named by the
// Organisation code and the device identifier. Plain values, so a test reads them without opening a database.

export const INDEX_DATABASE = 'apparel-os-counter';
export const IDENTITY_DATABASE_PREFIX = 'apparel-os-counter-device';

/** The name of one identity's database (5.3). */
export function identityDatabaseName(organisationCode: string, deviceId: string): string {
  return `${IDENTITY_DATABASE_PREFIX}:${organisationCode}:${deviceId}`;
}
