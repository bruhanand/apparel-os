import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { priceBill, type PriceBillInput } from '@apparel-os/calculations';
import type { TaxRuleCaEvidenceDraft, TaxRuleChanged, TaxRuleKind, TaxRulesInForceAnswer } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculationInputs } from '../src/modules/finance/tax-rules/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment } from './support/access.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import {
  taxRulesSetup,
  writeSyntheticStoredFile,
  writeSyntheticTaxRegistration,
  type TaxRulesSetup,
} from './support/tax-rules.js';

// S1-F09-T04: the tax-rule records through the tax rules part's interface and access's Decide, on real PostgreSQL
// (shared-calculations 10; books-and-posting 6.3, GC4-2; POL-10.02, POL-10.05; PRD-TAX-005; DEC-116). Every rate,
// slab, component, basis and rounding rule here is the SYNTHETIC rule data of shared-calculations 12.3, never a value
// of KDPS, Accounts or the CA (V-18, GC7-1 to GC7-4, GC7-8).

let world: SyntheticWorld;
let setup: TaxRulesSetup;
let other: TaxRulesSetup;
let registrationId: string;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

/** The golden case CG-01 of shared-calculations 12.4, as the package keeps it (12.1). */
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../packages/calculations/golden/CG-01.json'), 'utf8'),
) as { input: PriceBillInput; expected: unknown };

beforeAll(async () => {
  world = await createSyntheticOrganisations('taxrules');
  const [orgA, orgB] = world.organisations;
  const keysEnvironment = syntheticKeysEnvironment(world);
  setup = await taxRulesSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'TAX-A',
  });
  other = await taxRulesSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'TAX-B',
  });
  registrationId = await writeSyntheticTaxRegistration(orgA.database, syntheticCode('REG-1'));
});

afterAll(async () => {
  await (setup as TaxRulesSetup | undefined)?.close();
  await (other as TaxRulesSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

type Outcome<T> = { kind: 'success'; answer: T } | { kind: 'refusal'; refusal: { code: string } };

function recorded<T>(outcome: Outcome<T>): T {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

const SYNTHETIC_REFERENCE = {
  kind: 'reference',
  what: syntheticName('CA approval of the tax rules'),
  givenBy: syntheticName('CA'),
  givenOn: '2026-10-01',
  keptAt: syntheticName('Accounts file'),
} as const;

/** The CA's evidence of the versions, recorded by the approver before deciding (10.1; GC4-2). */
async function referenced(versions: { kind: TaxRuleKind; versionId: string }[], on: TaxRulesSetup = setup) {
  const evidence: TaxRuleCaEvidenceDraft['evidence'] = SYNTHETIC_REFERENCE;
  return recorded(await on.asApproverDo((c, r) => on.taxRules.recordCaEvidence(c, r, { versions, evidence })));
}

/** Records the CA's reference and approves the version as the different Accounts user. */
async function approve(kind: TaxRuleKind, changed: TaxRuleChanged, on: TaxRulesSetup = setup) {
  await referenced([{ kind, versionId: changed.versionId }], on);
  const decided = await on.decide(changed.requestId, changed.versionId);
  if (decided.kind !== 'success') throw new Error(`Decision refused: ${decided.refusal.code}`);
  return changed;
}

const classification = async (code: string, validFrom = setup.today(), on: TaxRulesSetup = setup) =>
  recorded(
    await on.asPreparerDo((c, p) => on.taxRules.prepareClassification(c, p, { code, validFrom, origin: 'synthetic' })),
  );

const read = (date: string, classifications: string[], on: TaxRulesSetup = setup, registration = registrationId) =>
  on.run(on.outsider.id, (c) =>
    on.taxRules.readTaxRules(c, { date, taxRegistrationId: registration, classifications }),
  );

/** Replaces each version identifier the read answered with the label the golden case holds for it. */
function labelled(value: unknown, labels: ReadonlyMap<string, string>): unknown {
  return JSON.parse(JSON.stringify(value), (_key, each: unknown) =>
    typeof each === 'string' ? (labels.get(each) ?? each) : each,
  ) as unknown;
}

describe('the synthetic rule data of 12.3 read back (shared-calculations 10.2, 12.3)', () => {
  it('PRD-TAX-005 POL-10.02 reads back, approved by a different Accounts user, the rule inputs and versions CG-01 holds', async () => {
    const today = setup.today();
    const labels = new Map<string, string>();
    const hsn1 = await approve('goods-classification', await classification(syntheticCode('HSN-1')));
    const hsn2 = await approve('goods-classification', await classification(syntheticCode('HSN-2')));
    labels.set(hsn1.versionId, 'syn-tax-1').set(hsn2.versionId, 'syn-tax-1');
    const golden = GOLDEN.input.tax;
    for (const [classificationId, code] of [
      [hsn1.recordId, syntheticCode('HSN-1')],
      [hsn2.recordId, syntheticCode('HSN-2')],
    ] as const) {
      const rule = golden.rateRules.find((each) => each.classification === code);
      if (rule === undefined) throw new Error(`CG-01 has no rate rule of ${code}`);
      const content =
        rule.kind === 'single-rate'
          ? { kind: rule.kind, rate: rule.rate }
          : {
              kind: rule.kind,
              comparedValue: { ...rule.comparedValue },
              slabs: rule.slabs.map((slab) => ({ ...slab })),
            };
      const changed = await setup.asPreparerDo((c, p) =>
        setup.taxRules.prepareRateRule(c, p, {
          classificationId,
          rule: content,
          validFrom: today,
          origin: 'synthetic',
        }),
      );
      labels.set((await approve('tax-rate-rule', recorded(changed))).versionId, rule.version);
    }
    const registration = golden.registration;
    if (registration === undefined || golden.priceBasis === undefined) throw new Error('CG-01 sets both');
    const applicability = await setup.asPreparerDo((c, p) =>
      setup.taxRules.prepareApplicability(c, p, {
        taxRegistrationId: registrationId,
        chargesTax: registration.chargesTax,
        components: [...registration.components],
        validFrom: today,
        origin: 'synthetic',
      }),
    );
    labels.set((await approve('registration-applicability', recorded(applicability))).versionId, registration.version);
    const basis = await setup.asPreparerDo((c, p) =>
      setup.taxRules.preparePriceBasis(c, p, {
        pricesIncludeTax: golden.priceBasis?.pricesIncludeTax ?? false,
        validFrom: today,
        origin: 'synthetic',
      }),
    );
    labels.set((await approve('price-basis', recorded(basis))).versionId, golden.priceBasis.version);
    for (const kind of ['discount', 'tax', 'bill'] as const) {
      const rule = GOLDEN.input.rounding[kind];
      if (rule === undefined) throw new Error(`CG-01 sets the ${kind} rounding rule`);
      const changed = await setup.asPreparerDo((c, p) =>
        setup.taxRules.prepareRoundingRule(c, p, {
          kind,
          unit: rule.unit,
          mode: rule.mode,
          ...('level' in rule ? { level: rule.level } : {}),
          validFrom: today,
          origin: 'synthetic',
        }),
      );
      labels.set((await approve('rounding-rule', recorded(changed))).versionId, rule.version);
    }

    const answer = await read(today, [syntheticCode('HSN-1'), syntheticCode('HSN-2')]);
    const inputs = calculationInputs(answer);
    expect(labelled(inputs.tax, labels)).toEqual(golden);
    expect(labelled(inputs.rounding, labels)).toEqual(GOLDEN.input.rounding);
    // The same inputs price CG-01's bill to its expected result, the versions echoed being the ones read.
    const priced = priceBill({ ...GOLDEN.input, businessDate: today, tax: inputs.tax, rounding: inputs.rounding });
    expect(labelled(priced, labels)).toEqual({
      ok: true,
      value: { ...(GOLDEN.expected as object), businessDate: today },
    });
  });
});

describe('what is refused (shared-calculations 10.1, 10.3)', () => {
  it('GC2-7 DEC-105 refuses a version starting on a past date', async () => {
    const outcome = await setup.asPreparerDo((c, p) =>
      setup.taxRules.prepareClassification(c, p, {
        code: syntheticCode(next('HSNX')),
        validFrom: setup.day(-1),
        origin: 'synthetic',
      }),
    );
    expect(outcome).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.starts-in-past' } });
  });

  it('POL-10.05 refuses a version decided with no CA evidence attached or referenced, and approves it once referenced', async () => {
    const changed = await classification(syntheticCode(next('HSNX')));
    expect(await setup.decide(changed.requestId, changed.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'finance.no-ca-evidence' },
    });
    await approve('goods-classification', changed);
  });

  it('PRD-ACS-006 POL-02.07 refuses a version approved by its preparer or by someone outside Accounts', async () => {
    const changed = await classification(syntheticCode(next('HSNX')));
    await referenced([{ kind: 'goods-classification', versionId: changed.versionId }]);
    expect(await setup.decide(changed.requestId, changed.versionId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    expect(await setup.decide(changed.requestId, changed.versionId, 'approve', setup.outsider)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.not-eligible' },
    });
    expect(await setup.decide(changed.requestId, changed.versionId)).toMatchObject({ kind: 'success' });
  });

  it('PRD-MOD-010 refuses overlapping approved versions', async () => {
    const start = setup.day(20);
    const hsn = await approve('goods-classification', await classification(syntheticCode(next('HSNX'))));
    const later = (versionToken: string, retired: boolean) =>
      setup.asPreparerDo((c, p) =>
        setup.taxRules.prepareClassificationVersion(c, p, hsn.recordId, {
          retired,
          validFrom: start,
          origin: 'synthetic',
          versionToken,
        }),
      );
    const firstVersion = recorded(await later(hsn.versionId, true));
    await approve('goods-classification', firstVersion);
    // A second version from the same day would overlap the approved one: refused when prepared, and by the exclusion
    // constraint under it (code-house-rules 7.3).
    const third = await later(firstVersion.versionId, false);
    expect(third).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.version-overlaps' } });
  });

  it('POL-10.02 refuses slabs that do not start at zero, and component shares that do not add up to one', async () => {
    const hsn = await approve('goods-classification', await classification(syntheticCode(next('HSNX'))));
    const slabs = await setup.asPreparerDo((c, p) =>
      setup.taxRules.prepareRateRule(c, p, {
        classificationId: hsn.recordId,
        rule: {
          kind: 'slabs',
          comparedValue: { per: 'unit', discounts: 'after', tax: 'excluded' },
          slabs: [{ lowerBound: 100, boundIn: 'this-slab', rate: '10' }],
        },
        validFrom: setup.today(),
        origin: 'synthetic',
      }),
    );
    expect(slabs).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.rate-rule-invalid' } });
    const shares = await setup.asPreparerDo((c, p) =>
      setup.taxRules.prepareApplicability(c, p, {
        taxRegistrationId: registrationId,
        chargesTax: true,
        components: [
          { component: 'SYN-X', share: '0.5' },
          { component: 'SYN-Y', share: '0.4' },
        ],
        validFrom: setup.today(),
        origin: 'synthetic',
      }),
    );
    expect(shares).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.shares-invalid' } });
  });

  it('shared-calculations 3.3 refuses a level on a discount or bill rule and a unit of zero', async () => {
    const draft = { mode: 'half-up', validFrom: setup.day(40), origin: 'synthetic' } as const;
    for (const kind of ['discount', 'bill'] as const) {
      expect(
        await setup.asPreparerDo((c, p) =>
          setup.taxRules.prepareRoundingRule(c, p, { ...draft, kind, unit: 1, level: 'line' }),
        ),
      ).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.rounding-level-invalid' } });
    }
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.taxRules.prepareRoundingRule(c, p, { ...draft, kind: 'tax', unit: 0, level: 'line' }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.rounding-unit-not-positive' } });
  });
});

describe('what is read (shared-calculations 10.2; code-house-rules 12.14)', () => {
  it('PRD-MOD-015 never reads an unapproved version, and answers not set for a date with no record in force', async () => {
    const code = syntheticCode(next('HSNX'));
    await classification(code);
    const awaiting = await read(setup.today(), [code]);
    expect(awaiting.classifications).toEqual([
      { code, classification: { kind: 'not-set' }, rateRule: { kind: 'not-set' } },
    ]);
    const before: TaxRulesInForceAnswer = await read('2000-01-01', [syntheticCode('HSN-1')]);
    expect(before).toEqual({
      date: '2000-01-01',
      priceBasis: { kind: 'not-set' },
      registration: { kind: 'not-set' },
      classifications: [
        { code: syntheticCode('HSN-1'), classification: { kind: 'not-set' }, rateRule: { kind: 'not-set' } },
      ],
      rounding: { discount: { kind: 'not-set' }, tax: { kind: 'not-set' }, bill: { kind: 'not-set' } },
    });
  });

  it('POL-10.05 takes one stored file as the CA evidence of a named set of versions', async () => {
    const first = await classification(syntheticCode(next('HSNX')));
    const second = await classification(syntheticCode(next('HSNX')));
    const file = await writeSyntheticStoredFile(world.organisations[0].database, setup.approver.id);
    const evidence = await setup.asApproverDo((c, r) =>
      setup.taxRules.recordCaEvidence(c, r, {
        versions: [
          { kind: 'goods-classification', versionId: first.versionId },
          { kind: 'goods-classification', versionId: second.versionId },
        ],
        evidence: { kind: 'file', file },
      }),
    );
    expect(recorded(evidence)).toEqual({ evidenceId: expect.any(String) as unknown });
    for (const each of [first, second]) {
      expect(await setup.decide(each.requestId, each.versionId)).toMatchObject({ kind: 'success' });
    }
    const record = await setup.run(setup.outsider.id, (c) =>
      setup.taxRules.readRecord(c, 'goods-classification', first.recordId, setup.today()),
    );
    expect(record?.versions).toEqual([
      expect.objectContaining({ id: first.versionId, state: 'In force', caEvidence: 1, origin: 'synthetic' }),
    ]);
  });

  it('PRD-MOD-001 a second synthetic Organisation sees none of these records', async () => {
    const answer = await read(setup.today(), [syntheticCode('HSN-1')], other);
    expect(answer.classifications[0]?.classification).toEqual({ kind: 'not-set' });
    expect(answer.priceBasis).toEqual({ kind: 'not-set' });
    expect(answer.registration).toEqual({ kind: 'not-set' });
    for (const kind of ['goods-classification', 'tax-rate-rule', 'price-basis', 'rounding-rule'] as const) {
      const page = await other.run(other.outsider.id, (c) => other.taxRules.listRecords(c, kind, other.today()));
      expect(page.records).toEqual([]);
    }
  });
});
