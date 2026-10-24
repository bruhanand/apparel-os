import { STOCK_RECEIPT_ORIGIN_TYPE, STOCK_SEARCH_READS } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../access/index.js';

// What a reader may see of stock search and the stage 2 reports, through `access` (access-and-approvals 5.3, 6, 7.1
// step 3; PRD-ACS-004, PRD-ACS-008, PRD-SEC-005; goods-in 9.1, 9.4, 9.5; S2-F11-T01, S2-F11-T02). A stock result is
// shown only when the reader's grants of view on every stock record type it is read from cover its place and brand, so
// its quantities never leave out a hold or a reservation the reader may not see; its cost only when the assignment
// that grants view on its receipt origins grants the cost field class too. In a list each row is authorised with its
// own facts, the assignments read once (RR-296). Each grant that shows a row is answered with its assignment, so an
// export holds every one of them at its step 0 (code-house-rules 8.2; code review 8 of stage 2).

/**
 * A search or report refused as a whole: the reader holds no grant of view on a record type it reads (7.1 step 3;
 * S2-F11-T01, S2-F11-T02).
 */
export class ReadRefused extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super(`Read refused: ${refusal.code}`);
    this.name = 'ReadRefused';
  }
}

/** The scope facts of a row a report or search shows: its place, legal entity and brand (access-and-approvals 5.3). */
export function factsOf(row: {
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
}): RecordFacts {
  return {
    siteId: row.siteId,
    ...(row.storeId === null ? {} : { storeId: row.storeId }),
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
  };
}

/**
 * Whether the reader may see each record of a report, by its own facts, for view on its record type (access-and-
 * approvals 5.3, 7.1 step 3; goods-in 9.1, 9.5; S2-F11-T02): the assignments read once for the whole list (RR-296). A
 * reader with no grant of view on the type at all is refused as a whole.
 */
export async function viewable(
  access: Pick<AccessInterface, 'authoriseEach'>,
  context: TransactionContext,
  actorId: string,
  recordType: string,
  facts: readonly RecordFacts[],
): Promise<readonly boolean[]> {
  const checked = await access.authoriseEach(context, { actorId, action: 'view', recordType }, facts);
  if (checked.kind === 'refused') throw new ReadRefused(checked.refusal);
  return checked.each.map((each) => each.kind === 'allowed');
}

/**
 * Refuses a report as a whole when the reader holds no grant of view on the record type anywhere (7.1 step 3), before
 * any of its records is read.
 */
export async function mayViewSome(
  access: Pick<AccessInterface, 'authoriseEach'>,
  context: TransactionContext,
  actorId: string,
  recordType: string,
): Promise<void> {
  await viewable(access, context, actorId, recordType, []);
}

/** A grant of view that shows a row: the record type and the assignment that grants it (7.1 step 3). */
export interface ViewGrant {
  readonly recordType: string;
  readonly roleAssignmentId: string;
}

/**
 * What the reader may see of each stock result, by its facts (access-and-approvals 7.1 step 3; 5.3): the grants of view
 * on every stock record type the search reads that show it, or undefined while any does not; and the assignment whose
 * view on the receipt origins grants the cost field class too, or none (access-and-approvals 6). A refusal of the read
 * as a whole is thrown (`ReadRefused`).
 */
export interface Authority {
  visible(facts: readonly RecordFacts[]): Promise<readonly (readonly ViewGrant[] | undefined)[]>;
  cost(facts: readonly RecordFacts[]): Promise<readonly (string | undefined)[]>;
}

/** A row shown, with the grants that show it and, where its cost is shown, the assignment granting the cost too. */
export interface Shown {
  readonly facts: RecordFacts;
  readonly views: readonly ViewGrant[];
  readonly costAssignmentId: string | undefined;
}

export function readerAuthority(
  access: Pick<AccessInterface, 'authoriseEach'>,
  context: TransactionContext,
  actorId: string,
): Authority {
  return {
    visible: async (facts: readonly RecordFacts[]) => {
      const grants: (ViewGrant[] | undefined)[] = facts.map(() => []);
      // One after another: one transaction's connection answers one statement at a time.
      for (const recordType of STOCK_SEARCH_READS) {
        const checked = await access.authoriseEach(context, { actorId, action: 'view', recordType }, facts);
        if (checked.kind === 'refused') throw new ReadRefused(checked.refusal);
        checked.each.forEach((each, at) => {
          grants[at] =
            each.kind === 'allowed'
              ? grants[at]?.concat({ recordType, roleAssignmentId: each.roleAssignmentId })
              : undefined;
        });
      }
      return grants;
    },
    cost: async (facts: readonly RecordFacts[]) => {
      const checked = await access.authoriseEach(
        context,
        {
          actorId,
          action: 'view',
          recordType: STOCK_RECEIPT_ORIGIN_TYPE,
          fieldClasses: [{ fieldClass: 'cost', use: 'view' }],
        },
        facts,
      );
      if (checked.kind === 'refused') return facts.map(() => undefined);
      return checked.each.map((each) => (each.kind === 'allowed' ? each.roleAssignmentId : undefined));
    },
  };
}
