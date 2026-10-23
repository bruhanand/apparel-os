import {
  IMPORT_BATCH_TYPE,
  PT_PREVIEW_PAGE_CAP,
  PT_REVISION_ROWS_PAGE_CAP,
  PT_TYPE,
  routes,
  type FieldClass,
} from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../../kernel/index.js';
import {
  ACCESS,
  replayRefusal,
  SignedIn,
  type AccessInterface,
  type RecordFacts,
  type SignedInUser,
} from '../../../access/index.js';
import { PT_FIELD_CLASSES } from '../domain/kinds.js';
import {
  BUSINESS_DATE_NOT_SET,
  grnNotFound,
  recordItem,
  reversalNotFound,
  revisionNotFound,
} from '../domain/refusals.js';
import type { PtInterface } from '../pt.js';
import { PT } from '../tokens.js';

/** No import batch of a PT file, or none the reader may see, has the identifier (code-house-rules 12.3). */
const batchNotFound = (batchId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(IMPORT_BATCH_TYPE, batchId)],
});

function refuse(refusal: CommandRefusal): never {
  throw new ApiRefusal({ ...refusal, missing: [...refusal.missing] });
}

/** A command's refusal, which no secret caused, so it is kept under the key (code-house-rules 12.4, 12.5). */
const refusalOutcome = (refusal: CommandRefusal): CommandOutcome<never> => ({
  kind: 'refusal',
  refusal,
  causedBySecret: false,
});

/**
 * `merchandise` · PT's routes (goods-in 5, section 11; module-map section 5; code-house-rules 12.1; S2-F04-T02). A PT
 * carries every scope fact of its GRN, so the guard Authenticates only and each route authorises in its transaction
 * with the GRN's facts (access-and-approvals 5.3, 7.1 step 3); a GRN, a revision or a batch the reader may not see is
 * not found, never refused as not authorised (code-house-rules 12.3). The withdrawal runs under its idempotency key,
 * holds its authority at step 0 (code-house-rules 8.2) and answers a replay only while the same Authorise still passes
 * (12.4). The file itself travels through the import routes. No rule lives here.
 */
@Controller()
export class PtController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(PT) private readonly pt: PtInterface,
  ) {}

  @ApiRoute(routes.readGrnPt)
  async readGrnPt(@RouteInput() input: RouteInputOf<typeof routes.readGrnPt>, @SignedIn() user: SignedInUser) {
    const { grnId } = input.params;
    return this.read(user, 'merchandise.read-grn-pt', async (context) => {
      const facts = await this.pt.grnFacts(context, grnId);
      if (facts === undefined) refuse(grnNotFound(grnId));
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: PT_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const masked = await this.maskedFor(context, user, authorised.roleAssignmentId);
      const read = await this.pt.grnPt(
        context,
        grnId,
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
        masked,
      );
      if (read === undefined) refuse(grnNotFound(grnId));
      const names = (await this.access.partyNames(context, read.people, [])).users;
      return {
        asOf: context.startedAt.toISOString(),
        ...read.view,
        people: [...names].map(([userId, name]) => ({ userId, name })),
      };
    });
  }

  @ApiRoute(routes.previewPtUpload)
  async previewPtUpload(
    @RouteInput() input: RouteInputOf<typeof routes.previewPtUpload>,
    @SignedIn() user: SignedInUser,
  ) {
    const { batchId } = input.params;
    return this.read(user, 'merchandise.preview-pt-upload', async (context) => {
      const batch = await this.pt.handlerBatch(context, batchId);
      const grnId = batch?.subject?.recordId;
      if (batch === undefined || grnId === undefined) refuse(batchNotFound(batchId));
      const viewsBatch = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: IMPORT_BATCH_TYPE,
        facts: batch.facts,
      });
      if (viewsBatch.kind === 'refused') refuse(viewsBatch.refusal);
      const facts = await this.pt.grnFacts(context, grnId);
      if (facts === undefined) refuse(batchNotFound(batchId));
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: PT_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const masked = await this.maskedFor(context, user, authorised.roleAssignmentId);
      // A page of at most the documented cap, the cap itself when none is asked (code-house-rules 12.1 "Reads").
      const { after, limit } = input.query;
      const preview = await this.pt.preview(
        context,
        batch,
        {
          ...(after === undefined ? {} : { after: Number(after) }),
          limit: limit === undefined ? PT_PREVIEW_PAGE_CAP : Number(limit),
        },
        masked,
      );
      if (preview === undefined) refuse(batchNotFound(batchId));
      return { asOf: context.startedAt.toISOString(), ...preview };
    });
  }

  /**
   * A PT revision as its approver reviews it in My work and its GRN's screen shows it (goods-in 6.2, 6.6; S2-F06-T01),
   * its rows a page at a time, the cap itself when none is asked (code-house-rules 12.1 "Reads").
   */
  @ApiRoute(routes.readPtRevision)
  async readPtRevision(
    @RouteInput() input: RouteInputOf<typeof routes.readPtRevision>,
    @SignedIn() user: SignedInUser,
  ) {
    const { revisionId } = input.params;
    return this.read(user, 'merchandise.read-pt-revision', async (context) => {
      const found = await this.pt.revisionFacts(context, revisionId);
      if (found === undefined) refuse(revisionNotFound(revisionId));
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: PT_TYPE,
        facts: found.facts,
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const masked = await this.maskedFor(context, user, authorised.roleAssignmentId);
      const { after, limit } = input.query;
      const request = (await this.access.approvalRequestsOf(context, [revisionId])).get(revisionId);
      const read = await this.pt.revision(
        context,
        revisionId,
        request,
        {
          ...(after === undefined ? {} : { after: Number(after) }),
          limit: limit === undefined ? PT_REVISION_ROWS_PAGE_CAP : Number(limit),
        },
        masked,
      );
      if (read === undefined) refuse(revisionNotFound(revisionId));
      const names = (await this.access.partyNames(context, read.people, [])).users;
      return {
        asOf: context.startedAt.toISOString(),
        ...read.view,
        people: [...names].map(([userId, name]) => ({ userId, name })),
      };
    });
  }

  /**
   * An Official PT as an XLSX file in its template's columns (goods-in 6.5, 6.6; PRD-PTW-008, PRD-PTW-009; S2-F06-T01,
   * code review 7): a command, since an export that includes a restricted field writes its access record
   * (numbering-and-audit 5.1; PRD-SEC-007). Authorised for view on the PT with the revision's facts and held at step 0;
   * BASIC and P RATE only for a reader granted cost, MARGIN only for one granted margin, each left out otherwise
   * (access-and-approvals 6; PRD-ACS-008). The answer is never kept under the key: an identical replay is refused as
   * not repeatable (code-house-rules 12.4, 12.6).
   */
  @ApiRoute(routes.downloadPt)
  async downloadPt(@RouteInput() input: RouteInputOf<typeof routes.downloadPt>, @SignedIn() user: SignedInUser) {
    const { revisionId } = input.params;
    const authoriseIn = (context: TransactionContext) => this.authorisedOn(context, user, revisionId, 'view');
    const answer = await this.helper.run(this.request(user, 'merchandise.download-pt'), {
      key: input.idempotencyKey,
      content: requestContentOf(routes.downloadPt, input),
      authoriseReplay: this.replayOf(authoriseIn),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const authorised = await authoriseIn(context);
        if (authorised.kind === 'refused') return refusalOutcome(authorised.refusal);
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          authorised.roleAssignmentId,
          { action: 'view', recordType: PT_TYPE, facts: authorised.facts },
        );
        if (held !== undefined) return refusalOutcome(held);
        const masked = await this.maskedFor(context, user, authorised.roleAssignmentId);
        const file = await this.pt.download(
          context,
          { userId: user.userId, networkAddress: user.networkAddress },
          revisionId,
          masked,
        );
        if ('code' in file) return refusalOutcome(file);
        return {
          kind: 'success',
          answer: { fileName: file.fileName, contentBase64: file.bytes.toString('base64') },
          shows: 'restricted-value',
        };
      },
    });
    return commandAnswer(answer);
  }

  /**
   * Post a failed PT again once its cause is fixed (goods-in 6.6; access-and-approvals 9.8 step 5; books-and-posting 10
   * step 5; code review 7): approve on the PT with the revision's facts, held at step 0; the command posts nothing
   * itself, it records a further request to post naming the same decision, which the posting job posts.
   */
  @ApiRoute(routes.postPtAgain)
  async postPtAgain(@RouteInput() input: RouteInputOf<typeof routes.postPtAgain>, @SignedIn() user: SignedInUser) {
    const { revisionId } = input.params;
    const authoriseIn = (context: TransactionContext) => this.authorisedOn(context, user, revisionId, 'approve');
    const answer = await this.helper.run(this.request(user, 'merchandise.post-pt-again'), {
      key: input.idempotencyKey,
      content: requestContentOf(routes.postPtAgain, input),
      authoriseReplay: this.replayOf(authoriseIn),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const authorised = await authoriseIn(context);
        if (authorised.kind === 'refused') return refusalOutcome(authorised.refusal);
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          authorised.roleAssignmentId,
          { action: 'approve', recordType: PT_TYPE, facts: authorised.facts },
        );
        if (held !== undefined) return refusalOutcome(held);
        const outcome = await this.pt.postAgain(
          context,
          { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId },
          revisionId,
        );
        if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
        return refusalOutcome(outcome.refusal);
      },
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.downloadPtTemplate)
  async downloadPtTemplate(
    @RouteInput() input: RouteInputOf<typeof routes.downloadPtTemplate>,
    @SignedIn() user: SignedInUser,
  ) {
    const { grnId } = input.params;
    return this.read(user, 'merchandise.download-pt-template', async (context, today) => {
      const facts = await this.pt.grnFacts(context, grnId);
      if (facts === undefined) refuse(grnNotFound(grnId));
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'create',
        recordType: PT_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const template = await this.pt.template(context, { ...input.query, date: today });
      if (template === undefined) {
        refuse({ kind: 'not-found', code: 'files-imports.layout-not-found', missing: [] });
      }
      if ('code' in template) refuse(template);
      return { fileName: template.fileName, contentBase64: template.bytes.toString('base64') };
    });
  }

  @ApiRoute(routes.withdrawPtRevision)
  async withdrawPtRevision(
    @RouteInput() input: RouteInputOf<typeof routes.withdrawPtRevision>,
    @SignedIn() user: SignedInUser,
  ) {
    const { revisionId } = input.params;
    const authoriseIn = (context: TransactionContext) => this.authorisedOn(context, user, revisionId, 'edit');
    const answer = await this.helper.run(this.request(user, 'merchandise.withdraw-pt-revision'), {
      key: input.idempotencyKey,
      content: requestContentOf(routes.withdrawPtRevision, input),
      authoriseReplay: this.replayOf(authoriseIn),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const authorised = await authoriseIn(context);
        if (authorised.kind === 'refused') return refusalOutcome(authorised.refusal);
        // Step 0: the actor and the assignment relied on, rechecked under the locks with the same facts (8.2).
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          authorised.roleAssignmentId,
          { action: 'edit', recordType: PT_TYPE, facts: authorised.facts },
        );
        if (held !== undefined) return refusalOutcome(held);
        const outcome = await this.pt.withdraw(
          context,
          { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId },
          revisionId,
          input.body.versionToken,
        );
        if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
        return refusalOutcome(outcome.refusal);
      },
    });
    return commandAnswer(answer);
  }

  /**
   * The revision's facts, as the reader may see it, and the action authorised with them; a revision the reader may not
   * see is not found, never refused as not authorised (code-house-rules 12.3).
   */
  private async authorisedOn(
    context: TransactionContext,
    user: SignedInUser,
    revisionId: string,
    action: 'view' | 'edit' | 'approve',
  ): Promise<
    | { readonly kind: 'allowed'; readonly roleAssignmentId: string; readonly facts: RecordFacts }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const found = await this.pt.revisionFacts(context, revisionId);
    if (found === undefined) return { kind: 'refused', refusal: revisionNotFound(revisionId) };
    const authorised = await this.access.authorise(context, {
      actorId: user.userId,
      action,
      recordType: PT_TYPE,
      facts: found.facts,
    });
    if (authorised.kind === 'refused') return authorised;
    return { kind: 'allowed', roleAssignmentId: authorised.roleAssignmentId, facts: found.facts };
  }

  /** A replay answered as any request failing the same checks would: a record not found stays not found (12.3, 12.4). */
  private replayOf(
    authoriseIn: (
      context: TransactionContext,
    ) => Promise<{ readonly kind: 'allowed' } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }>,
  ): ReplayAuthorisation {
    return async (context) => {
      const authorised = await authoriseIn(context);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return { kind: 'refused', refusal: replayRefusal(authorised.refusal) };
    };
  }

  /** A command as the signed-in user (code-house-rules 8.1, 12.4). */
  private request(user: SignedInUser, commandName: string) {
    return {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor' as const, actorId: user.userId },
    };
  }

  /**
   * Proposes the reversal of an Official PT before the scan-in, with a reason (goods-in 6.4, 6.7; DEC-137, PRD-REC-019;
   * S2-F09-T01): edit on the PT with its facts, as a withdrawal, held at step 0; a different person approves it in My
   * work through `access`'s Decide.
   */
  @ApiRoute(routes.proposePtReversal)
  async proposePtReversal(
    @RouteInput() input: RouteInputOf<typeof routes.proposePtReversal>,
    @SignedIn() user: SignedInUser,
  ) {
    const route = routes.proposePtReversal;
    const { revisionId } = input.params;
    const authoriseIn = async (context: TransactionContext) => {
      const found = await this.pt.revisionFacts(context, revisionId);
      if (found === undefined) return { kind: 'refused' as const, refusal: revisionNotFound(revisionId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'edit',
        recordType: PT_TYPE,
        facts: found.facts,
      });
      if (authorised.kind === 'refused') return authorised;
      return { kind: 'allowed' as const, roleAssignmentId: authorised.roleAssignmentId, facts: found.facts };
    };
    // A replay answers as any request failing the same checks would: a record not found stays not found (12.3, 12.4).
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await authoriseIn(context);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return { kind: 'refused', refusal: replayRefusal(authorised.refusal) };
    };
    const answer = await this.helper.run(
      {
        commandName: 'merchandise.propose-pt-reversal',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key: input.idempotencyKey,
        content: requestContentOf(route, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const authorised = await authoriseIn(context);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // Step 0: the actor and the assignment relied on, rechecked under the locks with the same facts (8.2).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            authorised.roleAssignmentId,
            { action: 'edit', recordType: PT_TYPE, facts: authorised.facts },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await this.pt.proposeReversal(
            context,
            { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId },
            revisionId,
            input.body,
          );
          if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }

  /** A PT's reversal as its approver reads it in My work (goods-in 6.7, section 11; S2-F09-T01). */
  @ApiRoute(routes.readPtReversal)
  async readPtReversal(
    @RouteInput() input: RouteInputOf<typeof routes.readPtReversal>,
    @SignedIn() user: SignedInUser,
  ) {
    const { reversalId } = input.params;
    const notFound = reversalNotFound(reversalId);
    return this.read(user, 'merchandise.read-pt-reversal', async (context) => {
      const facts = await this.pt.reversalFacts(context, reversalId);
      if (facts === undefined) refuse(notFound);
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: PT_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const request = (await this.access.approvalRequestsOf(context, [reversalId])).get(reversalId);
      const read = await this.pt.reversal(context, reversalId, request);
      if (read === undefined) refuse(notFound);
      const names = (await this.access.partyNames(context, read.people, [])).users;
      return {
        asOf: context.startedAt.toISOString(),
        ...read.view,
        people: [...names].map(([userId, name]) => ({ userId, name })),
      };
    });
  }

  /** The classes of a PT the reader's assignment does not grant, masked in what they read (access-and-approvals 6). */
  private async maskedFor(
    context: TransactionContext,
    user: SignedInUser,
    roleAssignmentId: string,
  ): Promise<ReadonlySet<FieldClass>> {
    const restricted = await this.access.restrictFields(
      context,
      { roleAssignmentId, actorId: user.userId, fieldClasses: PT_FIELD_CLASSES },
      'view',
    );
    return new Set(restricted.masked);
  }

  /** A read-only transaction as the signed-in user, under today's business date (code-house-rules 8.1, 9). */
  private async read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string) => Promise<Answer>,
  ): Promise<Answer> {
    return this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') refuse(BUSINESS_DATE_NOT_SET);
        return work(context, date.date);
      },
    );
  }
}
