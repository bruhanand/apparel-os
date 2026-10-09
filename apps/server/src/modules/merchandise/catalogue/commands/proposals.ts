import { uuidv7 } from '@apparel-os/domain';
import {
  VOCABULARY_CONFIRMATION,
  VOCABULARY_PROPOSAL_TYPE,
  type VocabularyProposalDraft,
  type VocabularyProposed,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { sqlStateOf, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { Preparer } from '../../../organisation/index.js';
import { attribute, vocabularyProposal, vocabularyValue } from '../db/schema.js';
import { inForceOn, recordItem, refused, today, type Outcome } from './common.js';

// Propose a vocabulary value (structure-and-masters 4.2, 4.7; PRD-IMP-008, POL-02.07; S1-F03-T01): the proposal is
// kept apart from the vocabulary, which keeps only approved values, and changes no operational data until a different
// person confirms it through the approval panel (effects.ts).

const UNIQUE_VIOLATION = '23505';

/** Whether a value of the attribute has the code, or an open proposal has it (2.1). */
export async function vocabularyCodeTaken(
  context: TransactionContext,
  attributeId: string,
  code: string,
  exceptProposal?: string,
): Promise<boolean> {
  const values = await context.tx
    .select({ id: vocabularyValue.id })
    .from(vocabularyValue)
    .where(and(eq(vocabularyValue.attributeId, attributeId), eq(vocabularyValue.code, code)));
  if (values.length > 0) return true;
  const open = await context.tx
    .select({ id: vocabularyProposal.id })
    .from(vocabularyProposal)
    .where(
      and(
        eq(vocabularyProposal.attributeId, attributeId),
        eq(vocabularyProposal.code, code),
        eq(vocabularyProposal.state, 'Proposed'),
        exceptProposal === undefined ? undefined : sql`${vocabularyProposal.id} <> ${exceptProposal}::uuid`,
      ),
    );
  return open.length > 0;
}

/**
 * Whether a value may be proposed for, or confirmed into, the attribute today: it exists, is list-type (GC2-9) and is
 * in force (2.2).
 */
export async function listAttributeRefusal<Answer>(
  context: TransactionContext,
  attributeId: string,
  date: string,
): Promise<Outcome<Answer> | undefined> {
  const [row] = await context.tx
    .select({ valueKind: attribute.valueKind })
    .from(attribute)
    .where(eq(attribute.id, attributeId));
  if (row === undefined) {
    return refused('not-found', 'merchandise.record-not-found', [recordItem('attribute', attributeId)]);
  }
  if (row.valueKind !== 'list') {
    return refused('refused', 'merchandise.attribute-not-list', [recordItem('attribute', attributeId)]);
  }
  if (!(await inForceOn(context, 'attribute', attributeId, date))) {
    return refused('refused', 'merchandise.reference-not-in-force', [recordItem('attribute', attributeId)]);
  }
  return undefined;
}

export async function proposeVocabularyValue(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly access: Pick<AccessInterface, 'requestApproval'> },
  proposer: Preparer,
  draft: VocabularyProposalDraft,
): Promise<Outcome<VocabularyProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const notList = await listAttributeRefusal<VocabularyProposed>(context, draft.attributeId, date);
  if (notList !== undefined) return notList;
  if (await vocabularyCodeTaken(context, draft.attributeId, draft.code)) {
    return refused('refused', 'merchandise.code-taken');
  }
  const proposalId = uuidv7();
  // Two proposals of one code at once: the second meets the open-code index and is refused, never failed.
  await context.tx.execute(sql`savepoint merchandise_proposal`);
  try {
    await context.tx.insert(vocabularyProposal).values({
      id: proposalId,
      attributeId: draft.attributeId,
      code: draft.code,
      name: draft.name,
      proposedByUserId: proposer.userId,
      state: 'Proposed',
    });
    await context.tx.execute(sql`release savepoint merchandise_proposal`);
  } catch (error) {
    if (sqlStateOf(error) !== UNIQUE_VIOLATION) throw error;
    await context.tx.execute(sql`rollback to savepoint merchandise_proposal`);
    return refused('refused', 'merchandise.code-taken');
  }
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: proposer.userId },
    roleAssignmentId: proposer.roleAssignmentId,
    record: { module: 'merchandise', type: 'vocabulary_proposal', id: proposalId },
    operation: 'propose-vocabulary-value',
    changes: [
      { kind: 'value', field: 'attributeId', before: null, after: draft.attributeId },
      { kind: 'value', field: 'code', before: null, after: draft.code },
      { kind: 'value', field: 'name', before: null, after: draft.name },
    ],
    source: { kind: 'screen' },
  });
  // The proposer is its one preparer; a different person confirms it (PRD-IMP-008; access-and-approvals 9.3).
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: VOCABULARY_CONFIRMATION,
    document: {
      module: 'merchandise',
      recordType: VOCABULARY_PROPOSAL_TYPE,
      recordId: proposalId,
      versionId: proposalId,
    },
    value: { kind: 'none' },
    preparers: [proposer.userId],
    requestedBy: proposer,
  });
  return { kind: 'success', answer: { proposalId, requestId } };
}
