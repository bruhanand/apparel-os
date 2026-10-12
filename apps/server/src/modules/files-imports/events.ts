import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// The events of files-imports (module-map 4.7, section 8; imports-and-opening-data 13.3). Identifiers only; consumers
// are idempotent on the event (PRD-INT-008). No consumer yet: module-map section 8 names `inbox` and `reports`, which
// arrive later.

/** A layout version, a mapping version or a mapping rule version was confirmed (6.4; S1-F06-T03). */
export const mappingConfirmed = defineEvent({
  type: 'files-imports.mapping-confirmed',
  version: 1,
  payload: z.strictObject({
    kind: z.enum(['layout-version', 'mapping-version', 'mapping-rule-version']),
    recordId: z.uuid(),
    versionId: z.uuid(),
  }),
});

/**
 * A document, or a whole batch, was published (13.3; S1-F06-T04): a document in its own transaction (3.3), the batch
 * when every document chosen has posted or is a duplicate (3.2).
 */
export const importPublished = defineEvent({
  type: 'files-imports.import-published',
  version: 1,
  payload: z.strictObject({ batchId: z.uuid(), documentId: z.uuid().optional() }),
});

/**
 * A publish attempt failed, with the outcome it kept, or a batch was withdrawn and Failed (13.3, 3.2; S1-F06-T04).
 */
export const importFailed = defineEvent({
  type: 'files-imports.import-failed',
  version: 1,
  payload: z.strictObject({ batchId: z.uuid(), outcomeId: z.uuid().optional() }),
});

/**
 * A publish whose documents post through a queued job was asked for (10.6; stock-ledger 10.6; access-and-approvals 9.8
 * step 1; S1-F13-T03): the request to post, its batch, and the accounting book whose queue it waits in, one job at a
 * time per book (code-house-rules 12.9). Its consumer is the posting consumer of the stage that brings a queued
 * handler; in stage 1 only the tests' (DEC-116).
 */
export const publishRequested = defineEvent({
  type: 'files-imports.publish-requested',
  version: 1,
  payload: z.strictObject({ publishRequestId: z.uuid(), batchId: z.uuid(), bookId: z.uuid() }),
});
