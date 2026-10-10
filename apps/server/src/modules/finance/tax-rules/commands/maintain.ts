import {
  assertApplicability,
  assertRateRule,
  assertRoundingRule,
  assertTaxRoundingRule,
} from '@apparel-os/calculations';
import { uuidv7 } from '@apparel-os/domain';
import {
  TAX_RULE_CHANGE,
  TAX_RULE_TYPE,
  type CaEvidenceRecorded,
  type TaxRuleCaEvidenceDraft,
  type GoodsClassificationDraft,
  type GoodsClassificationVersionDraft,
  type PriceBasisDraft,
  type RegistrationApplicabilityDraft,
  type RoundingRuleDraft,
  type SettingOrigin,
  type TaxRateRuleDraft,
  type TaxRuleChanged,
  type TaxRuleKind,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, Preparer } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { taxRegistrationCodes } from '../../../organisation/index.js';
import {
  goodsClassification,
  goodsClassificationVersion,
  priceBasis,
  priceBasisVersion,
  registrationTaxApplicability,
  registrationTaxApplicabilityVersion,
  registrationTaxComponent,
  roundingRule,
  roundingRuleVersion,
  taxRateRule,
  taxRateRuleVersion,
  taxRateSlab,
} from '../db/schema.js';
import {
  approvedOn,
  recordCaEvidence,
  refused,
  staleToken,
  today,
  type EvidenceVersions,
  type Outcome,
} from '../../books/index.js';
import { KIND_TABLES, lineOf, lockRecord, recordItem, recordLock, versionHead } from './lines.js';
import { classificationUsable } from './classification.js';

// Maintain tax rules (shared-calculations 3.3, 10.1, 10.3; module-map 4.14 "Maintain accounts, maps and rules";
// S1-F09-T04): a new record with its first version, or a new version, under the record's lock, each waiting for a
// different authorised Accounts user, who decides it through `access` with the CA's evidence recorded (effects.ts;
// POL-10.05; books-and-posting 6.3, GC4-2; DEC-116). The record checks are the pure ones of `@apparel-os/calculations`
// (S1-F11-T03). Each change writes its audit record in the same transaction. No value is defaulted (code-house-rules
// 12.14): every rate, slab, share, basis, unit, mode and level comes from the draft.

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
type Json = ValueChange['after'];
const value = (field: string, after: Json): ValueChange => ({ kind: 'value', field, before: null, after });
const from = (start: string) => `[${start},)`;

/** How the CA's evidence finds the tax-rule versions it names, with their records' locks (RR-486). */
const taxRuleVersions: EvidenceVersions<TaxRuleCaEvidenceDraft['versions'][number]> = {
  async find(context, refs) {
    const found = [];
    for (const ref of refs) {
      const head = await versionHead(context, ref.kind, ref.versionId);
      found.push(
        head === undefined
          ? undefined
          : {
              kind: ref.kind,
              recordType: TAX_RULE_TYPE,
              recordId: head.ownerId,
              versionId: ref.versionId,
              decision: head.decision,
              lock: recordLock(ref.kind, head.ownerId),
            },
      );
    }
    return found;
  },
  missing: (ref) => ({ kind: 'version', recordType: TAX_RULE_TYPE, versionId: ref.versionId }),
};

export interface MaintainDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

/** The version fields every draft shares. */
interface Versioned {
  readonly validFrom: string;
  readonly origin: SettingOrigin;
  readonly versionToken?: string | undefined;
}

/** A check of `@apparel-os/calculations` as a refusal: a rule that fails it is never stored (10.1, 10.3). */
function checked(code: string, check: () => void): CommandRefusal | undefined {
  try {
    check();
    return undefined;
  } catch (error) {
    if (error instanceof RangeError) return { kind: 'refused', code, missing: [] };
    throw error;
  }
}

export class TaxRulesMaintenance {
  constructor(protected readonly dependencies: MaintainDependencies) {}

  /** The origin accepted here and a start that is not in the past (code-house-rules 12.14; GC2-7, DEC-105). */
  private async admitted(context: TransactionContext, draft: Versioned): Promise<CommandRefusal | undefined> {
    const origin = this.dependencies.origins.originRefusal(context, draft.origin);
    if (origin !== undefined) return origin;
    const date = await today(context);
    if (typeof date !== 'string') return date;
    if (draft.validFrom < date) return { kind: 'refused', code: 'finance.starts-in-past', missing: [] };
    return undefined;
  }

  private async audit(
    context: TransactionContext,
    preparer: Preparer,
    record: { readonly type: string; readonly id: string; readonly versionId: string },
    operation: string,
    changes: readonly AuditChange[],
  ): Promise<void> {
    await this.dependencies.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'finance', ...record },
      operation,
      changes,
      source: { kind: 'screen' },
    });
  }

  /**
   * The shared tail of every version: under the record's lock, a fresh version token and no approved version starting
   * the same day (10.3); then the rows, the audit record and the request to a different authorised person (10.1).
   */
  private async version(
    context: TransactionContext,
    preparer: Preparer,
    kind: TaxRuleKind,
    recordId: string,
    draft: Versioned,
    write: (versionId: string) => Promise<readonly AuditChange[]>,
    operation: string,
  ): Promise<Outcome<TaxRuleChanged>> {
    if (!(await lockRecord(context, kind, recordId))) {
      return refused('not-found', 'finance.record-not-found', [recordItem(recordId)]);
    }
    const stale = await staleToken(context, lineOf(kind, recordId), draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const overlap = await approvedOn(context, lineOf(kind, recordId), draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    const versionId = uuidv7();
    const changes = await write(versionId);
    await this.audit(context, preparer, { type: KIND_TABLES[kind].identity, id: recordId, versionId }, operation, [
      ...changes,
      value('origin', draft.origin),
      value('validFrom', draft.validFrom),
    ]);
    const requestId = await this.dependencies.access.requestApproval(context, {
      actionType: TAX_RULE_CHANGE[kind],
      document: { module: 'finance', recordType: TAX_RULE_TYPE, recordId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId, versionId, requestId } };
  }

  /** The columns every version row shares, Awaiting approval until decided (code-house-rules 7.3). */
  private columns(preparer: Preparer, versionId: string, draft: Versioned) {
    return {
      id: versionId,
      origin: draft.origin,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval' as const,
      preparedByUserId: preparer.userId,
    };
  }

  /** Finds a record's identity by its key, or writes it, a race included; its identifier either way. */
  private async identity(
    context: TransactionContext,
    write: (id: string) => Promise<unknown>,
    find: () => Promise<string | undefined>,
  ): Promise<string> {
    const found = await find();
    if (found !== undefined) return found;
    const id = uuidv7();
    await withSavepoint(context, 'finance_tax_rule_identity', [UNIQUE_VIOLATION], () => write(id));
    const written = await find();
    if (written === undefined) throw new Error('A tax-rule record could be neither written nor found');
    return written;
  }

  // Goods classifications (10.1; POL-10.05).

  /** A new classification, one HSN entry with its code unique in the Organisation, and its first version (10.3). */
  async prepareClassification(
    context: TransactionContext,
    preparer: Preparer,
    draft: GoodsClassificationDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    const recordId = uuidv7();
    const written = await withSavepoint(context, 'finance_new_classification', [UNIQUE_VIOLATION], () =>
      context.tx.insert(goodsClassification).values({ id: recordId, code: draft.code }),
    );
    if (written.kind !== 'done') return refused('refused', 'finance.code-taken');
    return this.version(
      context,
      preparer,
      'goods-classification',
      recordId,
      draft,
      async (versionId) => {
        await context.tx.insert(goodsClassificationVersion).values({
          ...this.columns(preparer, versionId, draft),
          goodsClassificationId: recordId,
          retired: false,
        });
        return [value('code', draft.code), value('retired', false)];
      },
      'prepare-goods-classification',
    );
  }

  /** A classification's later version: retired from its start, or no longer; retired, never deleted (10.3). */
  async prepareClassificationVersion(
    context: TransactionContext,
    preparer: Preparer,
    classificationId: string,
    draft: GoodsClassificationVersionDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    return this.version(
      context,
      preparer,
      'goods-classification',
      classificationId,
      draft,
      async (versionId) => {
        await context.tx.insert(goodsClassificationVersion).values({
          ...this.columns(preparer, versionId, draft),
          goodsClassificationId: classificationId,
          retired: draft.retired,
        });
        return [value('retired', draft.retired)];
      },
      'prepare-goods-classification-version',
    );
  }

  // Rate and value rules (10.1, 10.3; PRD-TAX-005, POL-10.02).

  /**
   * A rate rule version for one classification, the first creating its rule: one rate, or slabs with the lowest at
   * zero, rising by lower bound, each bound's side stated and each rate an exact decimal, compared with the value the
   * rule names (GC7-2). The classification must be in force, not retired, on the rule's start (10.1).
   */
  async prepareRateRule(
    context: TransactionContext,
    preparer: Preparer,
    draft: TaxRateRuleDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    const [classification] = await context.tx
      .select({ id: goodsClassification.id, code: goodsClassification.code })
      .from(goodsClassification)
      .where(eq(goodsClassification.id, draft.classificationId));
    if (classification === undefined) {
      return refused('not-found', 'finance.record-not-found', [recordItem(draft.classificationId)]);
    }
    const invalid = checked('finance.rate-rule-invalid', () => {
      assertRateRule({ ...draft.rule, version: 'draft', classification: classification.code });
    });
    if (invalid !== undefined) return { kind: 'refusal', refusal: invalid };
    if (!(await classificationUsable(context, classification.id, draft.validFrom))) {
      return refused('refused', 'finance.reference-not-in-force', [recordItem(classification.id)]);
    }
    const recordId = await this.identity(
      context,
      (id) => context.tx.insert(taxRateRule).values({ id, goodsClassificationId: classification.id }),
      async () =>
        (
          await context.tx
            .select({ id: taxRateRule.id })
            .from(taxRateRule)
            .where(eq(taxRateRule.goodsClassificationId, classification.id))
        )[0]?.id,
    );
    const rule = draft.rule;
    return this.version(
      context,
      preparer,
      'tax-rate-rule',
      recordId,
      draft,
      async (versionId) => {
        await context.tx.insert(taxRateRuleVersion).values({
          ...this.columns(preparer, versionId, draft),
          taxRateRuleId: recordId,
          ruleKind: rule.kind,
          rate: rule.kind === 'single-rate' ? rule.rate : null,
          comparedPer: rule.kind === 'slabs' ? rule.comparedValue.per : null,
          comparedDiscounts: rule.kind === 'slabs' ? rule.comparedValue.discounts : null,
          comparedTax: rule.kind === 'slabs' ? rule.comparedValue.tax : null,
        });
        if (rule.kind === 'slabs') {
          await context.tx.insert(taxRateSlab).values(
            rule.slabs.map((slab) => ({
              id: uuidv7(),
              taxRateRuleVersionId: versionId,
              lowerBoundPaise: slab.lowerBound,
              boundIn: slab.boundIn,
              rate: slab.rate,
            })),
          );
        }
        return [value('classificationId', classification.id), value('rule', { ...rule })];
      },
      'prepare-tax-rate-rule-version',
    );
  }

  // Registration applicability (10.1; GC7-8).

  /**
   * An applicability version for one tax registration of `organisation`, the first creating its record: whether a
   * counter sale carries output tax and, when it does, its components, whose shares add up to one (10.1, 10.3).
   */
  async prepareApplicability(
    context: TransactionContext,
    preparer: Preparer,
    draft: RegistrationApplicabilityDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    const codes = await taxRegistrationCodes(context, [draft.taxRegistrationId]);
    const registration = codes.get(draft.taxRegistrationId);
    if (registration === undefined) {
      return refused('not-found', 'finance.tax-registration-not-found', [
        { kind: 'record', recordType: 'organisation.tax_registration', recordId: draft.taxRegistrationId },
      ]);
    }
    const invalid = checked('finance.shares-invalid', () => {
      assertApplicability({
        version: 'draft',
        registration,
        chargesTax: draft.chargesTax,
        components: draft.components,
      });
    });
    if (invalid !== undefined) return { kind: 'refusal', refusal: invalid };
    if (new Set(draft.components.map((each) => each.component)).size !== draft.components.length) {
      return refused('refused', 'finance.shares-invalid');
    }
    const recordId = await this.identity(
      context,
      (id) =>
        context.tx.insert(registrationTaxApplicability).values({ id, taxRegistrationId: draft.taxRegistrationId }),
      async () =>
        (
          await context.tx
            .select({ id: registrationTaxApplicability.id })
            .from(registrationTaxApplicability)
            .where(eq(registrationTaxApplicability.taxRegistrationId, draft.taxRegistrationId))
        )[0]?.id,
    );
    return this.version(
      context,
      preparer,
      'registration-applicability',
      recordId,
      draft,
      async (versionId) => {
        await context.tx.insert(registrationTaxApplicabilityVersion).values({
          ...this.columns(preparer, versionId, draft),
          registrationTaxApplicabilityId: recordId,
          chargesTax: draft.chargesTax,
        });
        if (draft.components.length > 0) {
          await context.tx.insert(registrationTaxComponent).values(
            draft.components.map((each) => ({
              id: uuidv7(),
              registrationTaxApplicabilityVersionId: versionId,
              component: each.component,
              share: each.share,
            })),
          );
        }
        return [
          value('taxRegistrationId', draft.taxRegistrationId),
          value('chargesTax', draft.chargesTax),
          value(
            'components',
            draft.components.map((each) => ({ ...each })),
          ),
        ];
      },
      'prepare-registration-applicability-version',
    );
  }

  // The price basis (10.1; GC7-1).

  /** A price basis version for the Organisation, the first creating its one record: one version in force (10.3). */
  async preparePriceBasis(
    context: TransactionContext,
    preparer: Preparer,
    draft: PriceBasisDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    const recordId = await this.identity(
      context,
      (id) => context.tx.insert(priceBasis).values({ id }),
      async () => (await context.tx.select({ id: priceBasis.id }).from(priceBasis))[0]?.id,
    );
    return this.version(
      context,
      preparer,
      'price-basis',
      recordId,
      draft,
      async (versionId) => {
        await context.tx.insert(priceBasisVersion).values({
          ...this.columns(preparer, versionId, draft),
          priceBasisId: recordId,
          pricesIncludeTax: draft.pricesIncludeTax,
        });
        return [value('pricesIncludeTax', draft.pricesIncludeTax)];
      },
      'prepare-price-basis-version',
    );
  }

  // Rounding rules (3.3, 10.3).

  /**
   * A rounding rule version of one kind, the first creating its rule: a unit in whole paise above zero, one of the four
   * modes, and a level only for the tax kind, where it is required (3.3, 10.3).
   */
  async prepareRoundingRule(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoundingRuleDraft,
  ): Promise<Outcome<TaxRuleChanged>> {
    const blocked = await this.admitted(context, draft);
    if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
    if ((draft.kind === 'tax') !== (draft.level !== undefined)) {
      return refused('refused', 'finance.rounding-level-invalid');
    }
    const invalid = checked('finance.rounding-unit-not-positive', () => {
      const rule = { version: 'draft', unit: draft.unit, mode: draft.mode };
      if (draft.level === undefined) assertRoundingRule(rule);
      else assertTaxRoundingRule({ ...rule, level: draft.level });
    });
    if (invalid !== undefined) return { kind: 'refusal', refusal: invalid };
    const recordId = await this.identity(
      context,
      (id) => context.tx.insert(roundingRule).values({ id, kind: draft.kind }),
      async () =>
        (
          await context.tx.select({ id: roundingRule.id }).from(roundingRule).where(eq(roundingRule.kind, draft.kind))
        )[0]?.id,
    );
    return this.version(
      context,
      preparer,
      'rounding-rule',
      recordId,
      draft,
      async (versionId) => {
        await context.tx.insert(roundingRuleVersion).values({
          ...this.columns(preparer, versionId, draft),
          roundingRuleId: recordId,
          kind: draft.kind,
          unitPaise: draft.unit,
          mode: draft.mode,
          level: draft.level ?? null,
        });
        return [
          value('kind', draft.kind),
          value('unit', draft.unit),
          value('mode', draft.mode),
          value('level', draft.level ?? null),
        ];
      },
      'prepare-rounding-rule-version',
    );
  }

  // The CA's evidence (10.1; books-and-posting 6.3, GC4-2; POL-10.05; DEC-116; RR-486).

  /**
   * Records the CA's evidence for a named set of tax-rule versions awaiting approval, before a different authorised
   * Accounts user decides them, as the one record of `finance` the books part keeps (RR-486, product owner, 10 Oct
   * 2026): this part finds its versions and their records' locks; the books part records the evidence.
   */
  recordCaEvidence(
    context: TransactionContext,
    recorder: Preparer,
    draft: TaxRuleCaEvidenceDraft,
  ): Promise<Outcome<CaEvidenceRecorded>> {
    return recordCaEvidence(context, this.dependencies, recorder, draft, taxRuleVersions);
  }
}
