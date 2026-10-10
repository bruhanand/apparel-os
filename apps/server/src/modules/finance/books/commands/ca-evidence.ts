import { uuidv7 } from '@apparel-os/domain';
import {
  CA_APPROVAL_EVIDENCE_TYPE,
  type CaEvidenceDraft,
  type CaEvidenceRecorded,
  type CaEvidenceView,
  type MissingItem,
} from '@apparel-os/schemas';
import { asc, eq, inArray, or } from 'drizzle-orm';
import { LOCK_STEP, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { Preparer } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { caApprovalEvidence, caApprovalEvidenceCover, type Decision } from '../db/schema.js';
import { refused, type Outcome } from './lines.js';

// The CA's approval evidence, one record for all of `finance` (books-and-posting 6.3; shared-calculations 10.1;
// POL-09.01, POL-10.05; DEC-112, GC4-2; DEC-116; RR-486, product owner, 10 Oct 2026): a stored file of files-imports,
// attached to each version it covers (S1-F06-T05), or a reference naming what it is, who gave it, its date and where it
// is kept, recorded before the decision against a named set of versions each still awaiting it. The books part owns
// the record and its cover; each part of `finance` finds its own versions, and the tax rules part records and checks
// the evidence through this interface (module-map 4.14).

/**
 * The column of the cover naming each kind of version the CA's evidence may cover (6.3; RR-486): the books part's
 * account, book-setting and posting map versions, and each kind of tax-rule version.
 */
export const COVER_COLUMNS = {
  account: caApprovalEvidenceCover.accountVersionId,
  'book-setting': caApprovalEvidenceCover.bookSettingVersionId,
  'posting-map': caApprovalEvidenceCover.postingMapVersionId,
  'goods-classification': caApprovalEvidenceCover.goodsClassificationVersionId,
  'tax-rate-rule': caApprovalEvidenceCover.taxRateRuleVersionId,
  'registration-applicability': caApprovalEvidenceCover.registrationTaxApplicabilityVersionId,
  'price-basis': caApprovalEvidenceCover.priceBasisVersionId,
  'rounding-rule': caApprovalEvidenceCover.roundingRuleVersionId,
} as const;
export type CoveredKind = keyof typeof COVER_COLUMNS;

/** The cover's property naming each kind, for writing a cover row. */
const COVER_FIELDS = {
  account: 'accountVersionId',
  'book-setting': 'bookSettingVersionId',
  'posting-map': 'postingMapVersionId',
  'goods-classification': 'goodsClassificationVersionId',
  'tax-rate-rule': 'taxRateRuleVersionId',
  'registration-applicability': 'registrationTaxApplicabilityVersionId',
  'price-basis': 'priceBasisVersionId',
  'rounding-rule': 'roundingRuleVersionId',
} as const satisfies Record<CoveredKind, keyof typeof caApprovalEvidenceCover.$inferInsert>;

/** What the CA's evidence, as an attached file, carries: no restricted class (6.3; imports-and-opening-data 11). */
export const CA_APPROVAL_EVIDENCE_KIND = { kind: 'finance.ca-approval', restrictedClasses: [] } as const;

/** The evidence itself, a file or a reference (6.3): the same fields whichever versions it covers. */
export type CaEvidence = CaEvidenceDraft['evidence'];

/** A version the evidence names, as the part that keeps it finds it. */
export interface EvidenceTarget {
  readonly kind: CoveredKind;
  /** The record type the version is read and decided as, under which the file is attached. */
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId: string;
  readonly decision: Decision;
  /** The record's identity row, which a decision of the version locks at step 1. */
  readonly lock: LockTarget;
}

/** How a part of `finance` finds the versions a piece of evidence names: each one, or undefined when none exists. */
export interface EvidenceVersions<Ref> {
  find(context: TransactionContext, refs: readonly Ref[]): Promise<readonly (EvidenceTarget | undefined)[]>;
  /** The missing item naming a version that does not exist. */
  missing(ref: Ref): MissingItem;
}

export interface EvidenceDependencies {
  readonly audit: AuditInterface;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before: null,
  after,
});

const isTarget = (each: EvidenceTarget | undefined): each is EvidenceTarget => each !== undefined;

/**
 * Record the CA's approval evidence (6.3): one piece naming the set of versions it covers, each awaiting its decision
 * under its record's lock, taken at step 1 in one call so no decision passes it (code-house-rules 8.2). A file is
 * attached to each version it covers so it opens from each. One audit record names the piece and what it covers.
 */
export async function recordCaEvidence<Ref>(
  context: TransactionContext,
  dependencies: EvidenceDependencies,
  recorder: Preparer,
  draft: { readonly versions: readonly Ref[]; readonly evidence: CaEvidence },
  versions: EvidenceVersions<Ref>,
): Promise<Outcome<CaEvidenceRecorded>> {
  const named = await versions.find(context, draft.versions);
  const unknown = draft.versions.filter((_ref, index) => named[index] === undefined);
  if (unknown.length > 0) {
    return refused(
      'not-found',
      'finance.record-not-found',
      unknown.map((ref) => versions.missing(ref)),
    );
  }
  const locked = await context.lock(
    LOCK_STEP.document,
    named.filter(isTarget).map((each) => each.lock),
  );
  if (locked.missing.length > 0) throw new Error('A record of a version named could not be locked');
  // Rechecked under the locks: a version decided meanwhile takes no evidence.
  const under = (await versions.find(context, draft.versions)).filter(isTarget);
  const decided = under.filter((each) => each.decision !== 'Awaiting approval');
  if (decided.length > 0) {
    return refused(
      'refused',
      'finance.version-not-awaiting',
      decided.map((each) => ({
        kind: 'version',
        recordType: each.recordType,
        recordId: each.recordId,
        versionId: each.versionId,
      })),
    );
  }
  const evidenceId = uuidv7();
  const evidence = draft.evidence;
  await context.tx.insert(caApprovalEvidence).values({
    id: evidenceId,
    kind: evidence.kind,
    storedFileId: evidence.kind === 'file' ? evidence.file.storedFileId : null,
    fileReceiptId: evidence.kind === 'file' ? evidence.file.fileReceiptId : null,
    referenceWhat: evidence.kind === 'reference' ? evidence.what : null,
    referenceGivenBy: evidence.kind === 'reference' ? evidence.givenBy : null,
    referenceGivenOn: evidence.kind === 'reference' ? evidence.givenOn : null,
    referenceKeptAt: evidence.kind === 'reference' ? evidence.keptAt : null,
    recordedByUserId: recorder.userId,
  });
  const attachments: string[] = [];
  for (const each of under) {
    let attachmentId: string | null = null;
    if (evidence.kind === 'file') {
      const attached = await dependencies.files.attach(context, {
        storedFileId: evidence.file.storedFileId,
        fileReceiptId: evidence.file.fileReceiptId,
        record: { module: 'finance', type: each.recordType, id: each.recordId, versionId: each.versionId },
        evidence: CA_APPROVAL_EVIDENCE_KIND,
        scope: {},
        attachedBy: { kind: 'user', id: recorder.userId },
        roleAssignmentId: recorder.roleAssignmentId,
      });
      attachmentId = attached.attachmentId;
      attachments.push(attachmentId);
    }
    await context.tx.insert(caApprovalEvidenceCover).values({
      id: uuidv7(),
      caApprovalEvidenceId: evidenceId,
      [COVER_FIELDS[each.kind]]: each.versionId,
      attachmentId,
    });
  }
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: recorder.userId },
    roleAssignmentId: recorder.roleAssignmentId,
    record: { module: 'finance', type: CA_APPROVAL_EVIDENCE_TYPE.replace('finance.', ''), id: evidenceId },
    operation: 'record-ca-approval-evidence',
    changes: [
      value('kind', evidence.kind),
      value(
        'versions',
        under.map((each) => ({ kind: each.kind, recordType: each.recordType, versionId: each.versionId })),
      ),
      ...(evidence.kind === 'file'
        ? [value('attachments', attachments)]
        : [
            value('what', evidence.what),
            value('givenBy', evidence.givenBy),
            value('givenOn', evidence.givenOn),
            value('keptAt', evidence.keptAt),
          ]),
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { evidenceId } };
}

const coverOf = (versionIds: readonly string[]) =>
  or(...Object.values(COVER_COLUMNS).map((column) => inArray(column, [...versionIds])));

/** Whether a piece of the CA's evidence covers the version (6.3): without it a decision gives the version no effect. */
export async function caEvidenceCovers(context: TransactionContext, versionId: string): Promise<boolean> {
  const rows = await context.tx
    .select({ id: caApprovalEvidenceCover.id })
    .from(caApprovalEvidenceCover)
    .where(coverOf([versionId]))
    .limit(1);
  return rows.length > 0;
}

/** The CA's evidence covering each version named (6.3), by version, as a reader sees it. */
export async function caEvidenceOf(
  context: TransactionContext,
  versionIds: readonly string[],
): Promise<ReadonlyMap<string, CaEvidenceView[]>> {
  const found = new Map<string, CaEvidenceView[]>();
  if (versionIds.length === 0) return found;
  const rows = await context.tx
    .select({ cover: caApprovalEvidenceCover, evidence: caApprovalEvidence })
    .from(caApprovalEvidenceCover)
    .innerJoin(caApprovalEvidence, eq(caApprovalEvidence.id, caApprovalEvidenceCover.caApprovalEvidenceId))
    .where(coverOf(versionIds))
    .orderBy(asc(caApprovalEvidence.id));
  for (const { cover, evidence: e } of rows) {
    const versionId = Object.values(COVER_FIELDS)
      .map((field) => cover[field])
      .find((id): id is string => id !== null);
    if (versionId === undefined) continue;
    const view: CaEvidenceView =
      e.kind === 'file'
        ? { id: e.id, kind: 'file', attachmentId: cover.attachmentId ?? '' }
        : {
            id: e.id,
            kind: 'reference',
            what: e.referenceWhat ?? '',
            givenBy: e.referenceGivenBy ?? '',
            givenOn: e.referenceGivenOn ?? '',
            keptAt: e.referenceKeptAt ?? '',
          };
    found.set(versionId, [...(found.get(versionId) ?? []), view]);
  }
  return found;
}
