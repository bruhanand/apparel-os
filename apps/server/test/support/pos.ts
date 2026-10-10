import { webcrypto } from 'node:crypto';
import {
  deviceProofMessage,
  devicePublicKeySchema,
  type BusinessUnitKind,
  type DeviceProofPurpose,
  type DevicePublicKey,
} from '@apparel-os/schemas';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { approved, decided, prepared, type StructureSetup } from './organisation.js';

// SYNTHETIC Stores, units and billing-device keys for the tests of billing devices (offline-counter 3, 4; S1-F12-T01),
// made through organisation's real commands (code-house-rules 11.2) and WebCrypto as the counter uses it in the
// browser. Every value here is SYNTHETIC.

/** A SYNTHETIC legal entity with two tax registrations and a book, two Stores at one Site, and units of each kind. */
export interface SyntheticStores {
  readonly legalEntityId: string;
  readonly registrationIds: readonly [string, string];
  /** The legal entity's book, for a mapping version of a unit (S1-F12-T02). */
  readonly bookId: string;
  readonly siteId: string;
  readonly storeId: string;
  readonly otherStoreId: string;
  /** Units of the Store: a whole-store unit and a brand counter on the first registration, a counter on the second. */
  readonly wholeStore: string;
  readonly counterSameRegistration: string;
  readonly counterOtherRegistration: string;
  /** A whole-store unit of the other Store. */
  readonly otherStoreUnit: string;
  /** A warehouse and an office at the Site, belonging to no Store. */
  readonly warehouse: string;
  readonly office: string;
}

export function syntheticStores(setup: StructureSetup, geography: { stateId: string; areaId: string }) {
  let counter = 0;
  const next = (prefix: string) =>
    syntheticCode(`${prefix}-${String(++counter)}-${Date.now().toString(36).toUpperCase()}`);

  return async function stores(): Promise<SyntheticStores> {
    const legalEntity = await approved(setup, (c, p) =>
      setup.organisation.prepareLegalEntity(c, p, {
        code: next('LE'),
        legalName: syntheticName('Devices legal entity'),
        validFrom: setup.today(),
      }),
    );
    const registration = (number: string) =>
      approved(setup, (c, p) =>
        setup.organisation.prepareTaxRegistration(c, p, {
          code: next('GSTIN'),
          legalEntityId: legalEntity.recordId,
          registrationNumber: `SYNTHETIC-${number}-${String(counter)}`,
          stateId: geography.stateId,
          validityFrom: setup.today(),
          validFrom: setup.today(),
        }),
      );
    const first = await registration('A');
    const second = await registration('B');
    const book = await approved(setup, (c, p) =>
      setup.organisation.prepareAccountingBook(c, p, {
        code: next('BK'),
        legalEntityId: legalEntity.recordId,
        name: syntheticName('Devices book'),
        validFrom: setup.today(),
      }),
    );
    const site = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: next('SITE'),
        name: syntheticName('Devices site'),
        physicalKind: 'retail-site',
        areaId: geography.areaId,
        addresses: [syntheticName('Address')],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const store = (name: string) =>
      approved(setup, (c, p) =>
        setup.organisation.prepareStore(c, p, {
          code: next('STORE'),
          name: syntheticName(name),
          format: 'ebo',
          operatingModel: 'company-owned',
          siteId: site.recordId,
          aliases: [],
          validFrom: setup.today(),
        }),
      );
    const storeA = await store('Devices store');
    const storeB = await store('Other store');
    const unit = async (kind: BusinessUnitKind, storeId: string | undefined, registrationId: string) => {
      const answer = prepared(
        await setup.prepare((c, p) =>
          setup.organisation.prepareBusinessUnit(c, p, {
            code: next('BU'),
            siteId: site.recordId,
            kind,
            ...(storeId === undefined ? {} : { storeId }),
            name: syntheticName(`Devices ${kind}`),
            legalEntityId: legalEntity.recordId,
            taxRegistrationId: registrationId,
            accountingBookId: book.recordId,
            validFrom: setup.today(),
          }),
        ),
      );
      decided(await setup.decide(answer.requestId, answer.versionId));
      return answer.recordId;
    };
    return {
      legalEntityId: legalEntity.recordId,
      registrationIds: [first.recordId, second.recordId],
      bookId: book.recordId,
      siteId: site.recordId,
      storeId: storeA.recordId,
      otherStoreId: storeB.recordId,
      wholeStore: await unit('whole-store', storeA.recordId, first.recordId),
      counterSameRegistration: await unit('brand-counter', storeA.recordId, first.recordId),
      counterOtherRegistration: await unit('brand-counter', storeA.recordId, second.recordId),
      otherStoreUnit: await unit('whole-store', storeB.recordId, first.recordId),
      warehouse: await unit('warehouse', undefined, first.recordId),
      office: await unit('office', undefined, first.recordId),
    };
  };
}

/**
 * A device key pair made as the counter makes it (offline-counter 3.2, 5.3): ECDSA P-256 with WebCrypto, the private
 * key non-extractable; the public key exported as a JWK, and a signer over deviceProofMessage.
 */
export async function syntheticDeviceKey(organisationCode: string): Promise<{
  readonly publicKey: DevicePublicKey;
  sign(purpose: DeviceProofPurpose, deviceId: string, challenge: string): Promise<string>;
}> {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey = devicePublicKeySchema.parse(await webcrypto.subtle.exportKey('jwk', pair.publicKey));
  return {
    publicKey,
    sign: async (purpose, deviceId, challenge) =>
      Buffer.from(
        await webcrypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          new TextEncoder().encode(deviceProofMessage(purpose, organisationCode, deviceId, challenge)),
        ),
      ).toString('base64url'),
  };
}
