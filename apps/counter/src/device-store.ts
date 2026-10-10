import Dexie, { type EntityTable } from 'dexie';
import { identityDatabaseName, INDEX_DATABASE } from './device-names';

// The counter's own storage of its device identity (offline-counter 3.2, 5.3; PRD-OFF-010; S1-F12-T01), in IndexedDB
// through Dexie (PRD Stack: Counter). One database per device identity, named by the Organisation code and the device
// identifier, holding the device's key pair: the private key non-extractable, so no script can read it and it never
// leaves the browser. A small index database says which identity this browser profile holds for each Organisation:
// at most one (3.2). Stores are only ever added in later versions, never dropped or rewritten (5.3; PRD-OFF-019).
// Nothing else is kept yet: the working set, carts and bills come with the offline counter (S4-F11).

/** The device identity this browser profile holds in one Organisation. */
export interface DeviceIdentity {
  readonly organisationCode: string;
  readonly deviceId: string;
  readonly code: string;
}

/** The device's key pair, as WebCrypto made it: the private key non-extractable. */
export interface StoredKey {
  readonly id: 'device';
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
}

class IndexDatabase extends Dexie {
  identities!: EntityTable<DeviceIdentity, 'organisationCode'>;

  constructor() {
    super(INDEX_DATABASE);
    this.version(1).stores({ identities: 'organisationCode' });
  }
}

class IdentityDatabase extends Dexie {
  keys!: EntityTable<StoredKey, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ keys: 'id' });
  }
}

const index = () => new IndexDatabase();
const identity = (organisationCode: string, deviceId: string) =>
  new IdentityDatabase(identityDatabaseName(organisationCode, deviceId));

/** Every identity this profile holds, one per Organisation. */
export async function identities(): Promise<DeviceIdentity[]> {
  const database = index();
  try {
    return await database.identities.toArray();
  } finally {
    database.close();
  }
}

/**
 * A new key pair for a device, ECDSA on curve P-256, the private key non-extractable (offline-counter 3.2), kept in
 * the identity's database before the server is asked to bind it, so an enrolment the server accepts never loses it.
 */
export async function newDeviceKey(organisationCode: string, deviceId: string): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const database = identity(organisationCode, deviceId);
  try {
    await database.keys.put({ id: 'device', privateKey: pair.privateKey, publicKey: pair.publicKey });
  } finally {
    database.close();
  }
  return pair;
}

/** Records that this profile holds the identity, once the server has bound its key (3.2). */
export async function keepIdentity(held: DeviceIdentity): Promise<void> {
  const database = index();
  try {
    await database.identities.put(held);
  } finally {
    database.close();
  }
}

/** Drops a key the server did not bind, with its database: nothing holds it. */
export async function dropUnboundKey(organisationCode: string, deviceId: string): Promise<void> {
  await Dexie.delete(identityDatabaseName(organisationCode, deviceId));
}

/** The device's private key, or undefined when the identity's database holds none. */
export async function deviceKey(organisationCode: string, deviceId: string): Promise<CryptoKey | undefined> {
  const database = identity(organisationCode, deviceId);
  try {
    return (await database.keys.get('device'))?.privateKey;
  } finally {
    database.close();
  }
}
