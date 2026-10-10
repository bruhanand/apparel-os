import type { MaybeKnown, Paise } from '@apparel-os/domain';
import type { PeriodState } from '@apparel-os/schemas';
import type { CommandRefusal } from '../../../../../kernel/index.js';
import type { NumberingInterface } from '../../../../numbering/index.js';
import type { journal } from '../../db/schema.js';
import type { ItemLine, PostingEventKind } from '../../domain/posting.js';
import type { PeriodRow, SourceRecord } from '../../queries/periods.js';

// What Check postable, Hold periods, Post and Reverse take and answer (books-and-posting 8, 9.1 to 9.4; module-map
// 4.14; S1-F09-T02).

/** One amount an item carries (7.1): a signed amount in paise, or Unknown (PRD-MOD-014, PRD-MOD-015). */
export interface PostComponent {
  readonly component: string;
  readonly amount: MaybeKnown<Paise>;
}

/** One item of a document: a valued movement, or another money effect (8.1). */
export interface PostItem {
  /** Unique for the source module, such as a movement's identifier (9.3). */
  readonly itemKey: string;
  readonly eventKind: string;
  readonly businessUnitId: string;
  /** The Store the caller took the item at, checked against the unit's (8.1); leave out to take the unit's. */
  readonly storeId?: string | null;
  readonly brandId: string | null;
  /** The source's business date; the accounting date (4.4). */
  readonly businessDate: string;
  readonly components: readonly PostComponent[];
}

/** One document's posting (8.1): its source, who posts it, and its items. */
export interface PostRequest {
  readonly sourceModule: string;
  readonly document: { readonly recordType: string; readonly recordId: string; readonly versionId?: string };
  readonly actor: { readonly kind: 'user' | 'service'; readonly id: string };
  /** The person a job acts for (access-and-approvals 9.8). */
  readonly onBehalfOfUserId?: string;
  readonly items: readonly PostItem[];
}

/** An item's whole content, whose hash tells a replay from a changed item (9.3). Amounts in paise, all known. */
export interface ItemContent {
  readonly eventKind: string;
  readonly businessUnitId: string;
  readonly storeId: string | null;
  readonly brandId: string | null;
  readonly businessDate: string;
  readonly components: readonly { readonly component: string; readonly amountPaise: Paise }[];
}

/** What 9.3 asks the caller to keep of an item already posted with different content, never a secret. */
export interface ChangedItem {
  readonly sourceModule: string;
  readonly itemKey: string;
  readonly postedHash: string;
  readonly changedHash: string;
  readonly content: ItemContent;
}

/** An item Check postable found postable, and what Post works from. */
export interface PostableItem {
  readonly kind: 'postable';
  readonly itemKey: string;
  readonly bookId: string;
  readonly legalEntityId: string;
  readonly period: { readonly id: string; readonly code: string; readonly state: PeriodState };
  /** The source document, by which a reopening may name the item as a correction (4.3; PRD-LED-020). */
  readonly source?: SourceRecord;
  /** The named correction the item enters a Locked or Reopened period as (4.3 step 3). */
  readonly correction?: string;
  readonly mapVersionId: string;
  readonly journalSeriesId: string;
  readonly eventKind: string;
  readonly accountingDate: string;
  readonly hash: string;
  readonly lines: readonly ItemLine[];
}

/** An item refused, with its reason; a changed item carries what the caller keeps (9.3). */
export interface RefusedItem {
  readonly kind: 'refused';
  readonly itemKey: string;
  readonly refusal: CommandRefusal;
  readonly changed?: ChangedItem;
}

/** Check postable's answer for one item (9.1), and what Post works from. */
export type ItemCheck =
  | PostableItem
  /** Every component is zero: nothing to post (9.2). */
  | { readonly kind: 'nothing'; readonly itemKey: string }
  /** Posted already with the same content: Post answers the first result (9.3). */
  | { readonly kind: 'posted'; readonly itemKey: string; readonly journalIds: readonly string[] }
  | RefusedItem;

/** A journal Post wrote or found (9.2): its book, number and the map version it used. */
export interface PostedJournal {
  readonly journalId: string;
  readonly bookId: string;
  readonly number: string;
  readonly eventKind: string;
  readonly accountingDate: string;
  readonly mapVersionId: string;
}

/** Post's one result per document (9.2). */
export type PostResult =
  | { readonly kind: 'posted'; readonly journals: readonly PostedJournal[] }
  | { readonly kind: 'nothing-to-post' }
  | { readonly kind: 'refused'; readonly items: readonly RefusedItem[] };

export interface PostDependencies {
  readonly kinds: ReadonlyMap<string, PostingEventKind>;
  readonly numbering: NumberingInterface;
}

/** A reversal (9.1, 9.4): the journal it reverses and the reversal's own business date. */
export interface ReverseRequest {
  readonly journalId: string;
  readonly businessDate: string;
  readonly actor: PostRequest['actor'];
  readonly onBehalfOfUserId?: string;
}

/** What Reverse needs held: the period of its date at step 7 and the journal series at step 8 (4.5, 5.4). */
export type ReversalPlan =
  | {
      readonly kind: 'reversible';
      readonly original: typeof journal.$inferSelect;
      readonly period: PeriodRow;
      readonly seriesId: string;
      /** The named correction the reversal enters a Locked or Reopened period as (4.3 step 3). */
      readonly correction?: string;
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };
