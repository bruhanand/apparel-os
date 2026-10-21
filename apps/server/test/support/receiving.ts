import { uuidv7 } from '@apparel-os/domain';
import { permissionRegistry, type AgreementTerms, type AssignmentScope } from '@apparel-os/schemas';
import type { TransactionContext } from '../../src/kernel/index.js';
import type { ValidityCheck } from '../../src/modules/configuration/index.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import { GRN_KIND, RECEIVING_CAPABILITY } from '../../src/modules/receiving/index.js';
import { syntheticCode, syntheticIdentifier, syntheticName } from '../fixtures/synthetic.js';
import type { SyntheticAuthority } from './grants.js';
import { approved, approvedGeography, decided, type StructureSetup } from './organisation.js';
import { syntheticStores, type SyntheticStores } from './pos.js';
import { connect } from './postgres.js';

// The SYNTHETIC world of Receive Goods (goods-in 4; S2-F02-T02), made through the real interfaces of organisation and
// merchandise where a person would make it (code-house-rules 11.2): a Site with two Stores and their units, the
// locations goods are received into, a brand with a linked supplier and an approved Agreement, a size list and a
// batch-tracked product. What other tickets prove is written as labelled fixtures: a mapping's verification
// (S1-F02-T02), an activity grant after readiness (S1-F04-T02), the capability switched on, and policies 4 and 10 Signed
// and validated (S1-F04-T01). Nothing here is KDPS's: every value, person and setting is SYNTHETIC.

/** The SYNTHETIC values the receiving policies' validations cover, for a validity check per policy (RR-480). */
const RECEIVING_GATE = syntheticIdentifier('receiving-gate');
const valuesCheck = (policy: 4 | 10): ValidityCheck => ({
  code: `${RECEIVING_GATE}.values-${String(policy)}`,
  policy,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () => Promise.resolve([{ key: 'syn-value', version: 'v1', origin: 'synthetic', enteredBy: [] }]),
  locks: () => Promise.resolve([]),
});

/** The SYNTHETIC validity check reporting one value of policy 10, which receiving needs beside policy 4. */
export const RECEIVING_STATUTORY_CHECK = valuesCheck(10);

/** The SYNTHETIC validity checks reporting one value of policies 4 and 10, registered in the test composition. */
export const receivingValidityChecks: readonly ValidityCheck[] = [valuesCheck(4), RECEIVING_STATUTORY_CHECK];

/** Every stock record type, viewed: what writing receipt counts needs under row-level security (stock-ledger 14.3). */
export const STOCK_VIEW: readonly SyntheticAuthority[] = permissionRegistry
  .filter((declaration) => declaration.code.startsWith('stock.'))
  .map((declaration) => ({ recordType: declaration.code, action: 'view' as const }));

/** What a receiver holds: the Arrival and its GRN, storing files, and seeing the stock it writes (goods-in 11). */
export const RECEIVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.arrival', action: 'create' },
  { recordType: 'receiving.arrival', action: 'edit' },
  { recordType: 'receiving.grn', action: 'view' },
  { recordType: 'receiving.grn', action: 'create' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  ...STOCK_VIEW,
];

/** What a reader of receipts holds (goods-in 12 test 20). */
export const RECEIPT_READER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.grn', action: 'view' },
  ...STOCK_VIEW,
];

/** A scope of the places given, every legal entity and brand (access-and-approvals 5.3). */
export function placeScope(
  members: readonly { readonly type: 'store' | 'site'; readonly id: string }[],
): AssignmentScope {
  return {
    kind: 'dimensions',
    legalEntity: { kind: 'all' },
    place: { kind: 'selected', members: [...members] },
    brand: { kind: 'all' },
  };
}

/** Terms with every value Unknown but the ownership-transfer event (POL-01.05; structure-and-masters 5.2). */
function terms(ownershipEvent: AgreementTerms['ownershipEvent']): AgreementTerms {
  return {
    commercialModel: null,
    ownershipEvent,
    returnRights: { allowed: null, window: null, startsAt: null },
    returnConditions: {
      conditionTags: null,
      packagingLimits: null,
      quantityLimits: null,
      supplierApproval: null,
      freightAndDeductions: null,
      settlement: null,
    },
    commissions: null,
    paymentTerms: null,
    creditNoteTerms: null,
    promotionTerms: null,
    cashDiscount: { rate: null, days: null, from: null },
    interest: { rate: null, days: null, from: null },
  };
}

function ok<A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } }): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

export interface ReceivingFixture extends SyntheticStores {
  /** Locations in force of the units that receive. */
  readonly storeLocation: string;
  readonly otherStoreLocation: string;
  readonly warehouseLocation: string;
  readonly counterLocation: string;
  readonly brand: { readonly id: string; readonly code: string; readonly name: string };
  /** A supplier linked to the brand, and one that is not. */
  readonly supplier: { readonly id: string; readonly code: string; readonly name: string };
  readonly unlinkedSupplierId: string;
  /** The Agreement version of the brand in force today, whose ownership passes at the sale (consignment). */
  readonly agreementVersionId: string;
  /** The SYNTHETIC size list: an attribute of list values, and two of its values. */
  readonly sizes: {
    readonly attributeId: string;
    readonly attributeCode: string;
    readonly values: readonly { readonly id: string; readonly code: string }[];
  };
  /** A product of the brand whose tracking profile requires a batch and expiry. */
  readonly batchSku: { readonly id: string; readonly styleCode: string };
  /** How the screens name the Site, the Stores' units and the first Store's location: "CODE · Name". */
  readonly options: {
    readonly site: string;
    readonly wholeStore: string;
    readonly warehouse: string;
    readonly storeLocation: string;
    readonly supplier: string;
    readonly brand: string;
    readonly sizeList: string;
    readonly sizes: readonly string[];
  };
}

/**
 * The world: the units of syntheticStores, receiving granted at the whole-store unit of each Store and at a brand
 * counter whose mapping stays unverified, never at the warehouse; and the masters of merchandise above.
 */
export async function receivingFixture(
  setup: StructureSetup,
  database: string,
  label: string,
): Promise<ReceivingFixture> {
  let counter = 0;
  const next = (prefix: string) => syntheticCode(`${label}-${prefix}-${String(++counter)}`);
  const geography = await approvedGeography(setup, `${label}-GEO`);
  const stores = await syntheticStores(setup, { stateId: geography.state.recordId, areaId: geography.area.recordId })();
  const location = async (businessUnitId: string, name: string) =>
    (
      await approved(setup, (c, p) =>
        setup.organisation.prepareLocation(c, p, {
          code: next('LOC'),
          siteId: stores.siteId,
          businessUnitId,
          name: syntheticName(name),
          kind: 'zone',
          validFrom: setup.today(),
        }),
      )
    ).recordId;
  const storeLocation = await location(stores.wholeStore, 'Receiving zone');
  const otherStoreLocation = await location(stores.otherStoreUnit, 'Other receiving zone');
  const warehouseLocation = await location(stores.warehouse, 'Warehouse receiving zone');
  const counterLocation = await location(stores.counterSameRegistration, 'Counter receiving zone');

  const today = setup.today();
  const brandCode = next('BRAND');
  const brandName = syntheticName(`${label} brand`);
  const brandId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, { code: brandCode, name: brandName, aliases: [], validFrom: today }),
    ),
  ).recordId;
  const party = async (name: string) => {
    const code = next('SUP');
    const legalName = syntheticName(name);
    const id = ok(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareParty(c, p, {
          code,
          legalName,
          taxIdentities: [],
          msmeClassification: null,
          contacts: [],
          roles: ['supplier'],
          validFrom: today,
        }),
      ),
    ).recordId;
    return { id, code, name: legalName };
  };
  const supplier = await party(`${label} supplier`);
  const unlinked = await party(`${label} unlinked supplier`);
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.parties.prepareBrandSupplierLink(c, p, {
        brandId,
        partyId: supplier.id,
        linked: true,
        validFrom: today,
      }),
    ),
  );
  const agreement = ok(
    await setup.asPreparerDo((c, p) =>
      setup.parties.prepareAgreement(c, p, {
        code: next('AGR'),
        counterparty: { kind: 'brand', brandId },
        terms: terms({ kind: 'sale-to-customer' }),
        margins: null,
        signedAgreement: [],
        validFrom: today,
      }),
    ),
  );
  decided(await setup.decide(agreement.requestId ?? '', agreement.versionId));

  // The size list: a list attribute and two confirmed values (structure-and-masters 4.2; goods-in 4.3; GI-3).
  const attributeCode = next('SIZE');
  const sizeListName = syntheticName('Size');
  const sizeAttributeId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: attributeCode,
        valueKind: 'list',
        name: sizeListName,
        validFrom: today,
      }),
    ),
  ).recordId;
  const value = async (attributeId: string, code: string) => {
    const proposed = ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, { attributeId, code, name: syntheticName(code) }),
      ),
    );
    decided(await setup.decide(proposed.requestId, proposed.proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
    if (confirmed?.valueId === undefined) throw new Error(`${code} was not confirmed`);
    return { id: confirmed.valueId, code };
  };
  const sizeValues = [await value(sizeAttributeId, next('S')), await value(sizeAttributeId, next('M'))];

  // A batch-tracked product of the brand (structure-and-masters 4.4 to 4.6; PRD-MER-011).
  const colourId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: next('COLOUR'),
        valueKind: 'list',
        name: syntheticName('Colour'),
        validFrom: today,
      }),
    ),
  ).recordId;
  const red = await value(colourId, next('RED'));
  const categoryId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategory(c, p, {
        code: next('CAT'),
        name: syntheticName('Category'),
        identityAttributeIds: [colourId],
        validFrom: today,
      }),
    ),
  ).recordId;
  const profileId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareTrackingProfile(c, p, {
        code: next('PROFILE'),
        name: syntheticName('Batch profile'),
        pieceTracked: false,
        batchExpiryRequired: true,
        requiredIdentifiers: [],
        validFrom: today,
      }),
    ),
  ).recordId;
  const link = await setup.run(setup.preparer.id, (c) =>
    setup.catalogue.record(c, 'category_tracking_profile', categoryId, today),
  );
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, categoryId, {
        trackingProfileId: profileId,
        validFrom: today,
        versionToken: link?.versionToken,
      }),
    ),
  );
  const styleCode = next('STYLE');
  const product = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeProduct(c, p, {
        style: { code: styleCode, brandId, categoryId, attributes: [] },
        skus: [
          {
            code: next('SKU'),
            identity: [{ attributeId: colourId, valueId: red.id }],
            stockUnit: 'piece',
            purpose: 'merchandise',
          },
        ],
        sourceWords: 'SYNTHETIC source words',
      }),
    ),
  );
  decided(await setup.decide(product.requestId, product.proposalId));
  const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, product.proposalId));
  const skuId = proposal?.skuIds[0];
  if (skuId === undefined) throw new Error('The batch-tracked product was not made');

  const owner = await connect(database, 'migration');
  try {
    // The mappings of the receiving units verified (S1-F02-T02); the counter's stays unverified (POL-10.08).
    for (const unit of [stores.wholeStore, stores.otherStoreUnit, stores.warehouse]) {
      await owner.query(
        `insert into organisation.business_unit_mapping_verification
           (id, business_unit_mapping_id, verified_by_user_id, verified_at, attachment_ids)
         select $1, id, $2, now(), array[$3::uuid] from organisation.business_unit_mapping
          where business_unit_id = $4 and decision = 'Approved'`,
        [uuidv7(), uuidv7(), uuidv7(), unit],
      );
    }
    // Receiving granted after readiness at the Stores' units and the counter, never at the warehouse (S1-F04-T02).
    for (const unit of [stores.wholeStore, stores.otherStoreUnit, stores.counterSameRegistration]) {
      await owner.query(
        `insert into configuration.activity_grant (id, activity, site_id, business_unit_id, granted,
           readiness_record_id, approval_decision_id, recorded_by_user_id, recorded_at)
         values ($1, 'receiving', $2, $3, true, $4, $5, $6, now())`,
        [uuidv7(), stores.siteId, unit, uuidv7(), uuidv7(), uuidv7()],
      );
    }
  } finally {
    await owner.end();
  }
  const structure = await setup.run(setup.preparer.id, (c) => setup.organisation.structureOn(c, setup.today()));
  const option = (record: { readonly code: string; readonly name: string } | undefined) =>
    record === undefined ? '' : `${record.code} · ${record.name}`;
  const options = {
    site: option(structure.sites.find((each) => each.id === stores.siteId)),
    wholeStore: option(structure.businessUnits.find((each) => each.id === stores.wholeStore)),
    warehouse: option(structure.businessUnits.find((each) => each.id === stores.warehouse)),
    storeLocation: option(structure.locations.find((each) => each.id === storeLocation)),
    supplier: `${supplier.code} · ${supplier.name}`,
    brand: `${brandCode} · ${brandName}`,
    sizeList: `${attributeCode} · ${sizeListName}`,
    sizes: sizeValues.map((each) => `${each.code} · ${syntheticName(each.code)}`),
  };
  return {
    ...stores,
    options,
    storeLocation,
    otherStoreLocation,
    warehouseLocation,
    counterLocation,
    brand: { id: brandId, code: brandCode, name: brandName },
    supplier,
    unlinkedSupplierId: unlinked.id,
    agreementVersionId: agreement.versionId,
    sizes: { attributeId: sizeAttributeId, attributeCode, values: sizeValues },
    batchSku: { id: skuId, styleCode },
  };
}

/** A policy Signed and validated as a fixture, and the values its validation covers, `<check>:<key>@<version>`. */
export interface SignedPolicy {
  readonly policy: number;
  readonly validatedValues: readonly string[];
}

/** Policies 4 and 10, covering the SYNTHETIC values of receivingValidityChecks. */
export const RECEIVING_POLICIES: readonly SignedPolicy[] = receivingValidityChecks.map((check) => ({
  policy: check.policy ?? 0,
  validatedValues: [`${check.code}:syn-value@v1`],
}));

/** The policies Signed and validated as SYNTHETIC fixtures (module-map 4.4; DM-6; S1-F04-T01). */
export async function policiesSigned(database: string, policies: readonly SignedPolicy[]): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    for (const { policy, validatedValues } of policies) {
      await owner.query(
        `insert into configuration.policy_signature (id, policy_number, signatory, signed_on, origin,
           evidence_attachment_ids, recorded_by_user_id, role_assignment_id, recorded_at)
         values ($1, $2, 'SYNTHETIC signatory', current_date, 'synthetic', array[$3::uuid], $4, $5, now())`,
        [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7()],
      );
      await owner.query(
        `insert into configuration.policy_validation (id, policy_number, origin, validated_values,
           evidence_attachment_ids, validated_by_user_id, role_assignment_id, validated_at)
         values ($1, $2, 'synthetic', $6::text[], array[$3::uuid], $4, $5, now())`,
        [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7(), [...validatedValues]],
      );
    }
  } finally {
    await owner.end();
  }
}

/**
 * The receiving capability switched on and policies 4 and 10 Signed and validated, as fixtures (module-map 4.4; DM-6;
 * S1-F04-T01): by default covering the SYNTHETIC values of receivingValidityChecks.
 */
export async function receivingGateOpen(
  database: string,
  policies: readonly SignedPolicy[] = RECEIVING_POLICIES,
): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query(
      `insert into configuration.capability_change (id, capability, switched_on, changed_by_user_id,
         role_assignment_id, changed_at)
       values ($1, $2, true, $3, $4, now())`,
      [uuidv7(), RECEIVING_CAPABILITY, uuidv7(), uuidv7()],
    );
  } finally {
    await owner.end();
  }
  await policiesSigned(database, policies);
}

/** A SYNTHETIC format of GRN numbers: no format is the Organisation's until it chooses one (numbering-and-audit 3.5). */
export const SYNTHETIC_GRN_FORMAT = [
  { kind: 'text' as const, text: 'SYN-GRN-' },
  { kind: 'sequence' as const, width: 5 },
];

/** Defines the GRN series with the SYNTHETIC format, as no screen does yet (RR-449; DEC-118). */
export async function defineSyntheticGrnSeries(context: TransactionContext, numbering: NumberingInterface) {
  const code = syntheticCode(`GRN-${uuidv7().slice(-6).toUpperCase()}`);
  const format = await numbering.defineFormatVersion(context, code, SYNTHETIC_GRN_FORMAT);
  if (format.kind !== 'done') throw new Error(`GRN format refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    kind: GRN_KIND.kind,
    scopeKey: 'organisation',
    displayScopeKey: 'organisation',
    formatCode: code,
  });
  if (series.kind !== 'done') throw new Error(`GRN series refused: ${series.refusal.code}`);
  return series.value;
}
