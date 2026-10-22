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
import { ACCESS, replayRefusal, SignedIn, type AccessInterface, type SignedInUser } from '../../../access/index.js';
import { BUSINESS_DATE_NOT_SET, grnNotFound, recordItem, revisionNotFound } from '../domain/refusals.js';
import type { PtInterface } from '../pt.js';
import { PT } from '../tokens.js';

/** No import batch of a PT file, or none the reader may see, has the identifier (code-house-rules 12.3). */
const batchNotFound = (batchId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(IMPORT_BATCH_TYPE, batchId)],
});

/** The classes of a PT's cost and margin, masked for a reader not granted them (access-and-approvals 6). */
const PT_CLASSES: readonly FieldClass[] = ['cost', 'margin'];

function refuse(refusal: CommandRefusal): never {
  throw new ApiRefusal({ ...refusal, missing: [...refusal.missing] });
}

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
   * An Official PT as an XLSX file in its template's columns (goods-in 6.5; PRD-PTW-008, PRD-PTW-009; S2-F06-T01). The
   * file carries BASIC, P RATE and MARGIN, so its reader is authorised with the cost and margin classes besides view
   * on the PT (access-and-approvals 6; PRD-ACS-008). Downloading changes nothing.
   */
  @ApiRoute(routes.downloadPt)
  async downloadPt(@RouteInput() input: RouteInputOf<typeof routes.downloadPt>, @SignedIn() user: SignedInUser) {
    const { revisionId } = input.params;
    return this.read(user, 'merchandise.download-pt', async (context) => {
      const found = await this.pt.revisionFacts(context, revisionId);
      if (found === undefined) refuse(revisionNotFound(revisionId));
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: PT_TYPE,
        facts: found.facts,
        fieldClasses: PT_CLASSES.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
      });
      if (authorised.kind === 'refused') refuse(authorised.refusal);
      const file = await this.pt.download(context, revisionId);
      if ('code' in file) refuse(file);
      return { fileName: file.fileName, contentBase64: file.bytes.toString('base64') };
    });
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
    const route = routes.withdrawPtRevision;
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
        commandName: 'merchandise.withdraw-pt-revision',
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
          const outcome = await this.pt.withdraw(
            context,
            { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId },
            revisionId,
            input.body.versionToken,
          );
          if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }

  /** The classes of a PT the reader's assignment does not grant, masked in what they read (access-and-approvals 6). */
  private async maskedFor(
    context: TransactionContext,
    user: SignedInUser,
    roleAssignmentId: string,
  ): Promise<ReadonlySet<FieldClass>> {
    const restricted = await this.access.restrictFields(
      context,
      { roleAssignmentId, actorId: user.userId, fieldClasses: PT_CLASSES },
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
