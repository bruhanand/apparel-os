import { routes } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  CommandDefect,
  commandAnswer,
  requestContentOf,
  RouteInput,
  routeAnswer,
  type RouteInputOf,
} from '../../../kernel/index.js';
import { SignedIn, type SignedInUser } from '../../access/index.js';
import type { ImportActor, ImportDependencies } from '../commands/import-common.js';
import { publishImport } from '../commands/publish-import.js';
import { startImport } from '../commands/start-import.js';
import { storeFile, type StoreFileDependencies } from '../commands/store-file.js';
import { validateImport } from '../commands/validate-import.js';
import { layoutList, readBatch } from '../queries/batches.js';
import { STORE_FILE_DEPENDENCIES } from './files.controller.js';

export const IMPORT_DEPENDENCIES = 'files-imports.ImportDependencies';

/**
 * Imports (imports-and-opening-data 3.1, 13.1, 13.2; S1-F06-T01): the import upload, the layouts, Start an import, one
 * batch, Validate and Publish. The controller holds no rule of its own: the commands and reads hold them.
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

  @ApiRoute(routes.publishImport)
  async publishImport(@RouteInput() input: RouteInputOf<typeof routes.publishImport>, @SignedIn() user: SignedInUser) {
    const answer = await publishImport(this.imports, {
      actor: actorOf(user),
      batchId: input.params.batchId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.publishImport, input),
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
