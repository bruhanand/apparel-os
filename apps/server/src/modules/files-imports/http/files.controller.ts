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
import { downloadAttachedFile, readAttachedFile, type ReadAttachedDependencies } from '../commands/read-attached.js';
import { storeFile, type StoreFileDependencies } from '../commands/store-file.js';

export const STORE_FILE_DEPENDENCIES = 'files-imports.StoreFileDependencies';
export const READ_ATTACHED_DEPENDENCIES = 'files-imports.ReadAttachedDependencies';

/**
 * Storing a file and reading an attached one (imports-and-opening-data 3.1, 11, 13.1; code-house-rules 12.1 "Files").
 * The controller holds no rule of its own: the checks, the encryption and the authority are the commands'.
 */
@Controller()
export class FilesController {
  constructor(
    @Inject(STORE_FILE_DEPENDENCIES) private readonly storing: StoreFileDependencies,
    @Inject(READ_ATTACHED_DEPENDENCIES) private readonly reading: ReadAttachedDependencies,
  ) {}

  @ApiRoute(routes.storeFile)
  async storeFile(@RouteInput() input: RouteInputOf<typeof routes.storeFile>, @SignedIn() user: SignedInUser) {
    if (user.roleAssignmentId === undefined) throw new CommandDefect('Store a file ran without Authorise');
    const answer = await storeFile(this.storing, {
      organisation: user.organisation,
      userId: user.userId,
      roleAssignmentId: user.roleAssignmentId,
      correlationId: user.correlationId,
      key: input.idempotencyKey,
      content: requestContentOf(routes.storeFile, input),
      body: input.body,
    });
    return commandAnswer(answer);
  }

  @ApiRoute(routes.readAttachedFile)
  async readAttachedFile(
    @RouteInput() input: RouteInputOf<typeof routes.readAttachedFile>,
    @SignedIn() user: SignedInUser,
  ) {
    return routeAnswer(await readAttachedFile(this.reading, readerOf(user), input.params.attachmentId), {
      replayed: false,
    });
  }

  @ApiRoute(routes.downloadAttachedFile)
  async downloadAttachedFile(
    @RouteInput() input: RouteInputOf<typeof routes.downloadAttachedFile>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await downloadAttachedFile(
      this.reading,
      readerOf(user),
      input.params.attachmentId,
      input.idempotencyKey,
      requestContentOf(routes.downloadAttachedFile, input),
    );
    return commandAnswer(answer);
  }
}

function readerOf(user: SignedInUser) {
  return {
    organisation: user.organisation,
    userId: user.userId,
    correlationId: user.correlationId,
    networkAddress: user.networkAddress,
  };
}
