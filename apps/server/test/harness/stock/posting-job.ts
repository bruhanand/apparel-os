import { paise, uuidv7 } from '@apparel-os/domain';
import { permissionRegistry } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  CommandRunner,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type CommandRefusal,
  type ConsumerDefinition,
  type LockTarget,
  type TransactionContext,
} from '../../../src/kernel/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../../../src/modules/access/commands/job-identities.js';
import type { LedgerItem } from '../../../src/modules/stock/ledger/index.js';
import { HARNESS_DOCUMENT_TYPE, HARNESS_MODULE, HARNESS_RECORD_TYPE } from '../../fixtures/stock-harness.js';
import { syntheticIdentifier } from '../../fixtures/synthetic.js';
import { syntheticWorkerSettings } from '../../fixtures/worker-settings.js';
import { syntheticTimezone } from '../../support/access.js';
import { grantSynthetic } from '../../support/grants.js';
import { writeSyntheticServiceIdentity } from '../../support/jobs.js';
import { databaseUrl } from '../../support/postgres.js';
import { PostingRefused, type ServiceActor } from '../../support/stock-ledger.js';
import type { HarnessDocument, StockHarness } from './harness.js';

// S1-F10-T07: the queued posting job of a large document on the stock harness (stock-ledger 10.6; access-and-approvals
// 9.8; code-house-rules 12.9; DEC-097; S1-F10 spec 2 "Queued posting jobs, one at a time per book"). The approval
// click records the decision, a request to post naming it and the approved version, and the outbox row, in one
// transaction with no stock or money effect; the document shows Posting. The harness's posting consumer, test-only and
// registered only with the worker a test starts, runs as a SYNTHETIC internal service identity on behalf of the
// approver. Its delivery goes to the posting queue, one at a time per accounting book (pg-boss's singleton key). Its
// step does the slow work first (reading the lines and making the items), then the one transaction of 10.2 through
// the ledger: the document locked at step 1 with the decision's request and rechecked, Plan, the locks, the rechecks,
// Verify under lock, Record use, Write with Post, the document Posted. A refusal rolls everything back: nothing is
// posted and the decision stays unused (DEC-097); a retry is a further request naming the same decision. Every value
// is SYNTHETIC.

/** The request to post a document's approved version (access-and-approvals 9.8 step 1): identifiers only. */
export const HARNESS_POST_REQUESTED = defineEvent({
  type: `${HARNESS_MODULE}.post-requested`,
  version: 1,
  payload: z.object({ postRequestId: z.uuid(), documentId: z.uuid(), bookId: z.uuid() }),
});

/** The SYNTHETIC internal service identity the posting consumer runs as (PRD-SEC-018). */
export const HARNESS_POSTING_IDENTITY = syntheticIdentifier('stock-posting');

const DOCUMENT_TABLE = { schema: 'test_stock_harness', table: 'document' } as const;

/** Points a test may hold the job at (code-house-rules 10.3): before its transaction's first lock of step 1, and under every lock. */
export interface PostingHooks {
  beforeLocks?: (context: TransactionContext, documentId: string) => Promise<void>;
  hold?: (context: TransactionContext) => Promise<void>;
  /** Called with the step's timings in milliseconds once its items are posted, before the commit. */
  timed?: (timing: { readonly slowWorkMs: number; readonly postingMs: number; readonly items: number }) => void;
}

interface PostRequestRow extends Record<string, unknown> {
  readonly document_id: string;
  readonly version_id: string;
  readonly decision_id: string;
  readonly action_type: string;
}

/**
 * The items of a document's step as its owning module would make them from its lines (the slow work of 10.6). Only a
 * PT approval posts as a job here: each line is a receipt origin whose cost the PT establishes at its P RATE, the
 * line's amount; the PT revision is the document (7.6).
 */
async function itemsOf(context: TransactionContext, documentId: string, versionId: string): Promise<LedgerItem[]> {
  const rows = await context.tx.execute<{ line_id: string; receipt_origin_id: string; amount_paise: string }>(sql`
    select line_id, receipt_origin_id, amount_paise::text from test_stock_harness.document_line
    where document_id = ${documentId} and version_id = ${versionId} order by line_id`);
  return rows.rows.map((row) => ({
    kind: 'cost-established',
    lineId: row.line_id,
    receiptOriginId: row.receipt_origin_id,
    ptRevisionId: documentId,
    pRatePaise: paise(Number(row.amount_paise)),
  }));
}

/** The posting consumer of the harness, posting as `actor` (S1-F10 spec 2; stock-ledger 10.6). */
export function harnessPostingConsumer(
  harness: StockHarness,
  actor: ServiceActor,
  hooks: PostingHooks = {},
): ConsumerDefinition {
  return defineConsumer({
    name: `${HARNESS_MODULE}.post-document`,
    event: HARNESS_POST_REQUESTED,
    serviceIdentity: HARNESS_POSTING_IDENTITY,
    authorises: { action: 'create', recordType: HARNESS_DOCUMENT_TYPE },
    postingBook: (event) => event.payload.bookId,
    handle: async (context, event) => {
      const started = performance.now();
      const [request] = (
        await context.tx.execute<PostRequestRow>(sql`
          select document_id, version_id, decision_id, action_type from test_stock_harness.post_request
          where id = ${event.payload.postRequestId}`)
      ).rows;
      if (request === undefined) {
        return {
          kind: 'refused',
          refusal: { kind: 'not-found', code: `${HARNESS_MODULE}.no-post-request`, missing: [] },
        };
      }
      // The slow work, before any lock of step 1 (10.6 "Staged commit").
      const items = await itemsOf(context, request.document_id, request.version_id);
      const preparers = (
        await context.tx.execute<{ recorded_by_user_id: string }>(sql`
          select distinct recorded_by_user_id from test_stock_harness.document_change
          where document_id = ${request.document_id} and version_id = ${request.version_id}`)
      ).rows.map((row) => row.recorded_by_user_id);
      await hooks.beforeLocks?.(context, request.document_id);
      const slowWorkMs = performance.now() - started;
      try {
        await harness.postIn(context, actor, items, {
          authorityHeld: true,
          source: {
            module: HARNESS_MODULE,
            recordType: HARNESS_RECORD_TYPE,
            recordId: request.document_id,
            versionId: request.version_id,
            importKind: 'none',
          },
          documentType: HARNESS_DOCUMENT_TYPE,
          approval: { decisionId: request.decision_id, actionType: request.action_type, preparers },
          ...(hooks.hold === undefined ? {} : { hold: hooks.hold }),
          document: {
            targets: [{ table: DOCUMENT_TABLE, id: request.document_id, mode: 'exclusive' } satisfies LockTarget],
            // Only the version the request names, and only while the document shows Posting (9.8 step 2).
            recheck: async (c) => recheckPosting(c, request),
            after: async (c) => {
              await c.tx.execute(sql`
                update test_stock_harness.document set state = 'posted' where id = ${request.document_id}`);
              hooks.timed?.({ slowWorkMs, postingMs: performance.now() - started - slowWorkMs, items: items.length });
            },
          },
        });
        return { kind: 'done' };
      } catch (error) {
        if (error instanceof PostingRefused) return { kind: 'refused', refusal: error.refusal };
        throw error;
      }
    },
  });
}

async function recheckPosting(
  context: TransactionContext,
  request: PostRequestRow,
): Promise<CommandRefusal | undefined> {
  const [row] = (
    await context.tx.execute<{ version_id: string; state: string }>(sql`
      select version_id, state from test_stock_harness.document where id = ${request.document_id}`)
  ).rows;
  const named = [{ kind: 'record', recordType: HARNESS_DOCUMENT_TYPE, recordId: request.document_id }];
  if (row === undefined) return { kind: 'not-found', code: `${HARNESS_MODULE}.document-not-found`, missing: named };
  if (row.version_id !== request.version_id) return { kind: 'conflict', code: 'kernel.stale-version', missing: named };
  if (row.state !== 'posting') return { kind: 'refused', code: `${HARNESS_MODULE}.document-state`, missing: named };
  return undefined;
}

/** A running worker with the harness's posting consumer, and the service identity it posts as. */
export interface PostingWorker {
  readonly worker: Worker;
  readonly hooks: PostingHooks;
  stop(): Promise<void>;
}

/**
 * Writes the posting consumer's SYNTHETIC service identity (create and view on the driver's document, view on every
 * stock record type, all places) and the outbox processor's, and answers the actor the consumer posts as, on behalf
 * of the harness's checker, who approves (access-and-approvals 9.8 step 2).
 */
export async function postingIdentity(harness: StockHarness): Promise<ServiceActor> {
  for (const organisation of harness.world.organisations) {
    await writeSyntheticServiceIdentity(organisation.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  }
  const id = await writeSyntheticServiceIdentity(harness.database, HARNESS_POSTING_IDENTITY);
  const granted = await grantSynthetic(
    harness.database,
    { kind: 'service-identity', id },
    [
      ...permissionRegistry
        .filter((declaration) => declaration.code.startsWith('stock.'))
        .map((declaration) => ({ recordType: declaration.code, action: 'view' as const })),
      { recordType: HARNESS_DOCUMENT_TYPE, action: 'view' },
      { recordType: HARNESS_DOCUMENT_TYPE, action: 'create' },
    ],
    { registry: harness.registryOf() },
  );
  return { serviceIdentityId: id, roleAssignmentId: granted.assignmentId, onBehalfOfUserId: harness.checker.user.id };
}

/** Starts a worker serving the harness's Organisations with its posting consumer, at the SYNTHETIC test speed. */
export async function startPostingWorker(
  harness: StockHarness,
  actor: ServiceActor,
  hooks: PostingHooks = {},
): Promise<PostingWorker> {
  const consumer = harnessPostingConsumer(harness, actor, hooks);
  const registry = { events: [HARNESS_POST_REQUESTED], consumers: [consumer], jobKinds: [] };
  const router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(harness.world.directory, 'runtime'), poolMax: 8 },
    harness.log.logger,
  );
  const runner = new CommandRunner({
    clock: { now: () => harness.now() },
    timezones: syntheticTimezone,
    logger: harness.log.logger,
  });
  const worker = new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: harness.log.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(harness.registryOf()),
    logger: harness.log.logger,
    registry,
    settings: syntheticWorkerSettings(registry, { fast: true }),
  });
  await worker.start();
  return {
    worker,
    hooks,
    stop: async () => {
      await worker.stop();
      await router.close();
    },
  };
}

/** The ids the click answers: the decision and the request to post. */
export interface PostingRequested {
  readonly decisionId: string;
  readonly postRequestId: string;
}

/**
 * The approval click (access-and-approvals 9.8 step 1; stock-ledger 10.6): the checker decides the document's current
 * version and, in the same transaction, records the request to post naming the decision and the version, moves the
 * document to Posting and writes the outbox row for the job. No stock or money effect.
 */
export async function approveForPosting(
  harness: StockHarness,
  document: HarnessDocument,
  actionType: string,
  value: { readonly kind: 'known'; readonly amountPaise: ReturnType<typeof paise> } | { readonly kind: 'unknown' },
  bookId: string,
): Promise<PostingRequested> {
  const requestId = await harness.requestApprovalOf(document, actionType, value);
  const checker = harness.checker.user;
  const totpCode = harness.nextCode(checker);
  const postRequestId = uuidv7();
  const decided = await harness.run(checker.id, async (context) => {
    const decision = await harness.access.decide(
      context,
      { kind: 'user', id: checker.id },
      {
        requestId,
        versionId: document.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: harness.reasonId },
        totpCode,
      },
    );
    if (decision.kind !== 'success') return decision;
    await requestPostIn(context, document, {
      postRequestId,
      decisionId: decision.answer.decisionId,
      actionType,
      bookId,
      by: checker.id,
    });
    await context.tx.execute(sql`update test_stock_harness.document set state = 'posting' where id = ${document.id}`);
    return decision;
  });
  if (decided.kind !== 'success') throw new Error(`approval refused: ${decided.refusal.code}`);
  document.state = 'posting';
  return { decisionId: decided.answer.decisionId, postRequestId };
}

/**
 * A retry (access-and-approvals 9.8 step 5): an authorised person asks again to post the version a decision approved,
 * naming the same decision. The job uses it only while it is unused and the version unchanged (DEC-097, DEC-066).
 */
export async function retryPosting(
  harness: StockHarness,
  document: HarnessDocument,
  requested: { readonly decisionId: string; readonly actionType: string; readonly versionId: string },
  bookId: string,
): Promise<string> {
  const postRequestId = uuidv7();
  await harness.run(harness.preparer.user.id, (context) =>
    requestPostIn(
      context,
      { ...document, versionId: requested.versionId },
      {
        postRequestId,
        decisionId: requested.decisionId,
        actionType: requested.actionType,
        bookId,
        by: harness.preparer.user.id,
      },
    ),
  );
  return postRequestId;
}

async function requestPostIn(
  context: TransactionContext,
  document: HarnessDocument,
  request: { postRequestId: string; decisionId: string; actionType: string; bookId: string; by: string },
): Promise<void> {
  await context.tx.execute(sql`
    insert into test_stock_harness.post_request (id, document_id, version_id, decision_id, action_type, book_id,
      requested_by_user_id)
    values (${request.postRequestId}, ${document.id}, ${document.versionId}, ${request.decisionId},
      ${request.actionType}, ${request.bookId}, ${request.by})`);
  await context.publish(HARNESS_POST_REQUESTED, {
    subject: {
      module: HARNESS_MODULE,
      recordType: HARNESS_DOCUMENT_TYPE,
      recordId: document.id,
      versionId: document.versionId,
    },
    scope: {},
    payload: { postRequestId: request.postRequestId, documentId: document.id, bookId: request.bookId },
  });
}
