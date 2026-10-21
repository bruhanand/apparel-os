import { permissionRegistry, type AgreementTerms, type AssignmentScope, type PolicyNumber } from '@apparel-os/schemas';
import { Audit } from '../../src/modules/audit/index.js';
import { Configuration, type ValidityCheck } from '../../src/modules/configuration/index.js';
import { policyEvidence } from '../../src/modules/files-imports/index.js';
import { mappingOn } from '../../src/modules/organisation/index.js';
import { RECEIVE_GOODS, RECEIVE_GOODS_STATUTORY, RECEIVING_CAPABILITY } from '../../src/modules/receiving/index.js';
import { SiteLifecycle, siteLifecycleApprovals } from '../../src/modules/site-lifecycle/index.js';
import { LocationStock } from '../../src/modules/stock/ledger/index.js';
import { syntheticCode, syntheticIdentifier, syntheticName } from '../fixtures/synthetic.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic, type SyntheticAuthority } from './grants.js';
import { capturingLogger } from './jobs.js';
import { approved, approvedGeography, decided, type StructureSetup } from './organisation.js';
import { syntheticStores, type SyntheticStores } from './pos.js';
import { writeSyntheticStoredFile } from './tax-rules.js';

// The SYNTHETIC world of Receive Goods (goods-in 4; S2-F02-T02), made through the real interfaces where a person would
// make it (code-house-rules 11.2): a Site with two Stores and their units, the locations goods are received into, a
// brand with a linked supplier and an approved Agreement, a size list and a batch-tracked product, the units' mappings
// verified by a person other than who made them; then, apart, the receiving capability switched on and policies 4 and
// 10 Signed and validated through configuration's commands, and receiving granted after readiness through
// site-lifecycle's, decided by a different person. The evidence of a signature, a validation and a verification is a
// SYNTHETIC stored file written as a fixture, as the stock harness writes it, since S1-F06-T05 proves storing files.
// Nothing here is KDPS's: every value, person and setting is SYNTHETIC.

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

function ok<A>(
  outcome:
    | { kind: 'success'; answer: A }
    | { kind: 'refusal'; refusal: { readonly code: string; readonly missing: readonly unknown[] } },
): A {
  if (outcome.kind !== 'success') {
    throw new Error(`Refused: ${outcome.refusal.code} ${JSON.stringify(outcome.refusal.missing)}`);
  }
  return outcome.answer;
}

/** "CODE · Name", as the screens name a record (receive.option); a record the fixture made is always there. */
function option(record: { readonly code: string; readonly name: string } | undefined, what: string): string {
  if (record === undefined) throw new Error(`The fixture's ${what} is not in the structure in force`);
  return `${record.code} · ${record.name}`;
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
  readonly batchSku: { readonly id: string; readonly code: string; readonly styleCode: string };
  /** How the screens name the Site, the Stores' units, the first Store's location and the masters: "CODE · Name". */
  readonly options: {
    readonly site: string;
    readonly wholeStore: string;
    readonly otherStoreUnit: string;
    readonly warehouse: string;
    readonly storeLocation: string;
    readonly otherStoreLocation: string;
    readonly supplier: string;
    readonly brand: string;
    readonly sizeList: string;
    readonly sizes: readonly string[];
    readonly batchSku: string;
  };
}

/**
 * The world: the units of syntheticStores, the mappings of the Stores' whole-store units and of the warehouse verified,
 * the brand counter's left unverified (POL-10.08); and the masters of merchandise above. Receiving is granted apart,
 * by receivingGranted, once the gate is open.
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
  // An Agreement version waits for a different authorised person (structure-and-masters 5.2; GC2-6).
  if (agreement.requestId === undefined) throw new Error('The Agreement version was not sent for approval');
  decided(await setup.decide(agreement.requestId, agreement.versionId));

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
  const skuCode = next('SKU');
  const product = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeProduct(c, p, {
        style: { code: styleCode, brandId, categoryId, attributes: [] },
        skus: [
          {
            code: skuCode,
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

  // The mappings of the Stores' units and the warehouse verified (structure-and-masters 3.4); the counter's is not.
  await mappingsVerified(setup, database, [stores.wholeStore, stores.otherStoreUnit, stores.warehouse]);

  const structure = await setup.run(setup.preparer.id, (c) => setup.organisation.structureOn(c, setup.today()));
  const unitOption = (id: string) =>
    option(
      structure.businessUnits.find((each) => each.id === id),
      'unit',
    );
  const locationOption = (id: string) =>
    option(
      structure.locations.find((each) => each.id === id),
      'location',
    );
  const options = {
    site: option(
      structure.sites.find((each) => each.id === stores.siteId),
      'Site',
    ),
    wholeStore: unitOption(stores.wholeStore),
    otherStoreUnit: unitOption(stores.otherStoreUnit),
    warehouse: unitOption(stores.warehouse),
    storeLocation: locationOption(storeLocation),
    otherStoreLocation: locationOption(otherStoreLocation),
    supplier: option(supplier, 'supplier'),
    brand: option({ code: brandCode, name: brandName }, 'brand'),
    sizeList: option({ code: attributeCode, name: sizeListName }, 'size list'),
    sizes: sizeValues.map((each) => option({ code: each.code, name: syntheticName(each.code) }, 'size')),
    batchSku: skuCode,
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
    batchSku: { id: skuId, code: skuCode, styleCode },
  };
}

/**
 * The units' mappings in force verified through organisation's command (structure-and-masters 3.4; POL-10.08) by the
 * setup's approver, who did not make them, each with a SYNTHETIC stored file as its evidence.
 */
async function mappingsVerified(setup: StructureSetup, database: string, unitIds: readonly string[]): Promise<void> {
  const verifier = setup.approver;
  const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: verifier.id }, [
    { recordType: 'organisation.business_unit_mapping_verification', action: 'view' },
    { recordType: 'organisation.business_unit_mapping_verification', action: 'create' },
  ]);
  for (const unitId of unitIds) {
    const evidence = await writeSyntheticStoredFile(database, verifier.id);
    ok(
      await setup.run(verifier.id, async (context) => {
        const mapping = await mappingOn(context, unitId, setup.today());
        if (mapping === undefined) throw new Error(`The unit ${unitId} has no mapping in force`);
        return setup.organisation.verifyMapping(
          context,
          { userId: verifier.id, roleAssignmentId: assignmentId },
          unitId,
          mapping.mappingVersionId,
          { evidence: [evidence] },
        );
      }),
    );
  }
}

/**
 * `configuration` as the composition root composes it for these fixtures: with the SYNTHETIC validity checks given
 * and receiving's two operations (goods-in 10.5), so its policy status and readiness checks read what the
 * application's do.
 */
function composedConfiguration(checks: readonly ValidityCheck[]) {
  const audit = new Audit(capturingLogger().logger);
  const configuration = new Configuration({ audit, environment: { name: 'local' }, evidence: policyEvidence(audit) });
  for (const check of checks) configuration.registerCheck(check, TEST_COMPOSITION);
  configuration.registerOperation(RECEIVE_GOODS);
  configuration.registerOperation(RECEIVE_GOODS_STATUTORY);
  return { audit, configuration };
}

/**
 * The receiving gate open Organisation-wide (goods-in 10.5; module-map 4.4; DM-6), through configuration's commands as
 * labelled synthetic status (code-house-rules 12.14): the setup's preparer records policies 4 and 10 Signed, the
 * approver, who entered none of their values, validates them, each with a SYNTHETIC stored file as evidence, and the
 * preparer switches the receiving capability on. `checks` are the SYNTHETIC checks reporting the policies' values that
 * the application under test registers.
 */
export async function receivingGateOpen(
  setup: StructureSetup,
  database: string,
  checks: readonly ValidityCheck[] = receivingValidityChecks,
): Promise<void> {
  const { configuration } = composedConfiguration(checks);
  const signer = setup.preparer;
  const validator = setup.approver;
  const signing = await grantSynthetic(database, { kind: 'user', id: signer.id }, [
    { recordType: 'configuration.policy_status', action: 'create' },
    { recordType: 'configuration.capability', action: 'edit' },
  ]);
  const validating = await grantSynthetic(database, { kind: 'user', id: validator.id }, [
    { recordType: 'configuration.policy_validation', action: 'create' },
  ]);
  const policies = new Set<PolicyNumber>();
  for (const check of checks) {
    if (check.policy === null) throw new Error(`The check ${check.code} reports no policy's values`);
    policies.add(check.policy);
  }
  for (const policy of policies) {
    const signatureEvidence = await writeSyntheticStoredFile(database, signer.id);
    ok(
      await setup.run(signer.id, (context) =>
        configuration.recordSignature(context, { userId: signer.id, roleAssignmentId: signing.assignmentId }, policy, {
          signatory: syntheticName(`policy ${String(policy)} signatory`),
          signedOn: setup.today(),
          origin: 'synthetic',
          evidence: [signatureEvidence],
        }),
      ),
    );
    const validationEvidence = await writeSyntheticStoredFile(database, validator.id);
    ok(
      await setup.run(validator.id, (context) =>
        configuration.recordValidation(
          context,
          { userId: validator.id, roleAssignmentId: validating.assignmentId },
          policy,
          { origin: 'synthetic', evidence: [validationEvidence] },
        ),
      ),
    );
  }
  ok(
    await setup.run(signer.id, (context) =>
      configuration.switchCapability(
        context,
        { userId: signer.id, roleAssignmentId: signing.assignmentId },
        RECEIVING_CAPABILITY,
        true,
      ),
    ),
  );
}

/** The people receiving's operations need at a unit (goods-in 10.5; PRD-ACS-006), for its users-and-access check. */
const RECEIVING_PEOPLE: readonly SyntheticAuthority[] = (RECEIVE_GOODS.needs?.permissions ?? []).map((each) => ({
  recordType: each.recordType,
  action: each.action,
}));

/**
 * Receiving granted after readiness at the units given of one Site, through site-lifecycle's commands
 * (module-map 4.16; PRD-LIF-001, PRD-LIF-002; S1-F04-T02): the setup's preparer, who holds the permissions receiving
 * needs at a unit, runs the Site's shared checks and each unit's, declaring that it holds no stock, and asks for each
 * approval; the approver, a different person, decides it, so the grant is written by the decision's effect. Needs the
 * gate open first (receivingGateOpen), since the checks ask for policies 4 and 10.
 */
export async function receivingGranted(
  setup: StructureSetup,
  database: string,
  siteId: string,
  unitIds: readonly string[],
  checks: readonly ValidityCheck[] = receivingValidityChecks,
): Promise<void> {
  const { audit, configuration } = composedConfiguration(checks);
  const locationInUse = new LocationStock();
  const access = setup.accessWith(
    siteLifecycleApprovals({ audit, configuration, grants: configuration.claimActivityGrants(), locationInUse }),
  );
  const siteLifecycle = new SiteLifecycle({ audit, configuration, access, locationInUse });
  const runner = setup.preparer;
  const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: runner.id }, [
    { recordType: 'site_lifecycle.readiness_record', action: 'view' },
    { recordType: 'site_lifecycle.readiness_record', action: 'create' },
    { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
    { recordType: 'site_lifecycle.zero_stock_declaration', action: 'create' },
    { recordType: 'access.approval_request', action: 'view' },
    ...RECEIVING_PEOPLE,
  ]);
  await grantSynthetic(database, { kind: 'user', id: setup.approver.id }, [
    { recordType: 'site_lifecycle.readiness_record', action: 'view' },
    { recordType: 'site_lifecycle.readiness_record', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ]);
  const by = { userId: runner.id, roleAssignmentId: assignmentId };
  const approve = async (readinessRecordId: string) => {
    const requested = ok(
      await setup.run(runner.id, (context) => siteLifecycle.requestActivation(context, by, readinessRecordId)),
    );
    decided(await setup.decideThrough(access, requested.requestId, readinessRecordId));
  };
  const site = ok(
    await setup.run(runner.id, (context) => siteLifecycle.runSiteReadiness(context, by, siteId, 'receiving')),
  );
  await approve(site.readinessRecordId);
  for (const unitId of unitIds) {
    ok(await setup.run(runner.id, (context) => siteLifecycle.declareZeroStock(context, by, unitId)));
    const ran = ok(
      await setup.run(runner.id, (context) => siteLifecycle.runReadiness(context, by, unitId, 'receiving')),
    );
    await approve(ran.readinessRecordId);
  }
}
