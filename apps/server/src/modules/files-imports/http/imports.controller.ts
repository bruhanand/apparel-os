import { routes, type CommandRoute } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  CommandDefect,
  commandAnswer,
  requestContentOf,
  RouteInput,
  routeAnswer,
  type CommandOutcome,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import { SignedIn, type Preparer, type SignedInUser } from '../../access/index.js';
import type { ImportActor, ImportDependencies } from '../commands/import-common.js';
import {
  proposeLayoutVersion,
  proposeMappingRule,
  proposeMappingVersion,
  type Outcome,
} from '../commands/proposals.js';
import { publishImport } from '../commands/publish-import.js';
import { markIssuesSeen, submitImport } from '../commands/review.js';
import { enterStagedValue, excludeImportDocument } from '../commands/staging-edits.js';
import { startImport } from '../commands/start-import.js';
import { storeFile, type StoreFileDependencies } from '../commands/store-file.js';
import { validateImport } from '../commands/validate-import.js';
import { layoutList, mappingRuleList, readBatch } from '../queries/batches.js';
import { detectLayout, valueSuggestions } from '../queries/detection.js';
import { STORE_FILE_DEPENDENCIES } from './files.controller.js';

export const IMPORT_DEPENDENCIES = 'files-imports.ImportDependencies';

/**
 * Imports (imports-and-opening-data 3.1, 5, 6, 8, 13.1, 13.2; S1-F06-T01, S1-F06-T03): the import upload, layouts,
 * mappings and mapping rules with their proposals, detection, Start an import, one batch, staging edits, Validate,
 * the report's Warnings marked seen, Submit for review and Publish. The controller holds no rule of its own: the
 * commands and reads hold them.
 */
@Controller()
export class ImportsController {
  constructor(
    @Inject(STORE_FILE_DEPENDENCIES) private readonly storing: StoreFileDependencies,
    @Inject(IMPORT_DEPENDENCIES) private readonly imports: ImportDependencies,
  ) {}

  @ApiRoute(routes.storeImportFile)
  async storeImportFile(
    @RouteInput() input: RouteInputOf<typeof routes.storeImportFile>,
    @SignedIn() user: SignedInUser,
  ) {
    if (user.roleAssignmentId === undefined) throw new CommandDefect('Store a file ran without Authorise');
    const answer = await storeFile(this.storing, {
      organisation: user.organisation,
      userId: user.userId,
      roleAssignmentId: user.roleAssignmentId,
      correlationId: user.correlationId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.storeImportFile, input),
      body: input.body,
      purpose: 'import',
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.listImportLayouts)
  async listImportLayouts(@SignedIn() user: SignedInUser) {
    const answer = await this.imports.runner.read(this.request('files-imports.list-layouts', user), (context) =>
      layoutList(this.imports, context, user.userId),
    );
    return routeAnswer(answer, { replayed: false });
  }

  @ApiRoute(routes.proposeLayoutVersion)
  proposeLayoutVersion(
    @RouteInput() input: RouteInputOf<typeof routes.proposeLayoutVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.proposal(routes.proposeLayoutVersion, 'files-imports.propose-layout-version', user, input, (c, p) =>
      proposeLayoutVersion(c, this.imports, p, input.body),
    );
  }

  @ApiRoute(routes.proposeMappingVersion)
  proposeMappingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.proposeMappingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.proposal(routes.proposeMappingVersion, 'files-imports.propose-mapping-version', user, input, (c, p) =>
      proposeMappingVersion(c, this.imports, p, input.body),
    );
  }

  @ApiRoute(routes.listMappingRules)
  async listMappingRules(@SignedIn() user: SignedInUser) {
    const answer = await this.imports.runner.read(this.request('files-imports.list-mapping-rules', user), async (c) => {
      const today = await c.businessDate();
      return mappingRuleList(
        this.imports,
        c,
        today.kind === 'set' ? today.date : c.startedAt.toISOString().slice(0, 10),
      );
    });
    return routeAnswer(answer, { replayed: false });
  }

  @ApiRoute(routes.proposeMappingRule)
  proposeMappingRule(
    @RouteInput() input: RouteInputOf<typeof routes.proposeMappingRule>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.proposal(routes.proposeMappingRule, 'files-imports.propose-mapping-rule', user, input, (c, p) =>
      proposeMappingRule(c, this.imports, p, input.body),
    );
  }

  @ApiRoute(routes.detectImportLayout)
  async detectImportLayout(
    @RouteInput() input: RouteInputOf<typeof routes.detectImportLayout>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await detectLayout(this.imports, actorOf(user), {
      storedFileId: input.params.storedFileId,
      fileReceiptId: input.query.fileReceiptId,
      hint: input.query.hint,
    });
    return routeAnswer(answer, { replayed: false });
  }

  @ApiRoute(routes.startImport)
  async startImport(@RouteInput() input: RouteInputOf<typeof routes.startImport>, @SignedIn() user: SignedInUser) {
    const answer = await startImport(this.imports, {
      actor: actorOf(user),
      key: input.idempotencyKey,
      content: requestContentOf(routes.startImport, input),
      body: input.body,
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.readImportBatch)
  async readImportBatch(
    @RouteInput() input: RouteInputOf<typeof routes.readImportBatch>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await this.imports.runner.read(this.request('files-imports.read-batch', user), (context) =>
      readBatch(this.imports, context, user.userId, input.params.batchId),
    );
    return routeAnswer(answer, { replayed: false });
  }

  @ApiRoute(routes.enterStagedValue)
  async enterStagedValue(
    @RouteInput() input: RouteInputOf<typeof routes.enterStagedValue>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await enterStagedValue(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      stagedRowId: input.params.stagedRowId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.enterStagedValue, input),
      body: input.body,
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.stagedValueSuggestions)
  async stagedValueSuggestions(
    @RouteInput() input: RouteInputOf<typeof routes.stagedValueSuggestions>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await this.imports.runner.read(this.request('files-imports.value-suggestions', user), (context) =>
      valueSuggestions(this.imports, context, user.userId, {
        batchId: input.params.batchId,
        stagedRowId: input.params.stagedRowId,
        field: input.query.field,
      }),
    );
    return routeAnswer(answer, { replayed: false });
  }

  @ApiRoute(routes.excludeImportDocument)
  async excludeImportDocument(
    @RouteInput() input: RouteInputOf<typeof routes.excludeImportDocument>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await excludeImportDocument(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      documentId: input.params.documentId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.excludeImportDocument, input),
      excluded: input.body.excluded,
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.validateImport)
  async validateImport(
    @RouteInput() input: RouteInputOf<typeof routes.validateImport>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await validateImport(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.validateImport, input),
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.markImportIssuesSeen)
  async markImportIssuesSeen(
    @RouteInput() input: RouteInputOf<typeof routes.markImportIssuesSeen>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await markIssuesSeen(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.markImportIssuesSeen, input),
      body: input.body,
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.submitImport)
  async submitImport(@RouteInput() input: RouteInputOf<typeof routes.submitImport>, @SignedIn() user: SignedInUser) {
    const answer = await submitImport(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.submitImport, input),
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.publishImport)
  async publishImport(@RouteInput() input: RouteInputOf<typeof routes.publishImport>, @SignedIn() user: SignedInUser) {
    const answer = await publishImport(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.publishImport, input),
      approvalDecisionId: input.body.approvalDecisionId,
    });
    return commandAnswer(answer);
  }

  /**
   * A proposal command on a route whose guard Authorised the action on the record type (access-and-approvals 7.1):
   * the assignment held at step 0 and rechecked under the locks (code-house-rules 8.2), then the proposal.
   */
  private async proposal<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, proposer: Preparer) => Promise<Outcome<Record<string, JsonValue>>>,
  ) {
    const roleAssignmentId = user.roleAssignmentId;
    if (roleAssignmentId === undefined) throw new CommandDefect(`Route ${route.path} proposes without Authorise`);
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.imports.access.authorise(context, need);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
    const answer = await this.imports.helper.run(this.request(commandName, user), {
      key: input.idempotencyKey,
      content: requestContentOf(route, input),
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await this.imports.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          roleAssignmentId,
          { action: need.action, recordType: need.recordType },
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        const outcome = await work(context, { userId: user.userId, roleAssignmentId });
        if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
        return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
      },
    });
    return commandAnswer(answer);
  }

  private request(commandName: string, user: SignedInUser) {
    return {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor' as const, actorId: user.userId },
    };
  }
}

function actorOf(user: SignedInUser): ImportActor {
  return { organisation: user.organisation, userId: user.userId, correlationId: user.correlationId };
}
