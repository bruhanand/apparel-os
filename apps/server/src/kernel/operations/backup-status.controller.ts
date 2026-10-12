import { BACKUP_STATUS_CAP, routes, type BackupEntry, type BackupStatus } from '@apparel-os/schemas';
import { Controller, Inject, Req } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { desc, eq } from 'drizzle-orm';
import type { CommandRunner } from '../command-runner/command-runner.js';
import { COMMAND_RUNNER } from '../command-runner/command-runner.module.js';
import { backupRecord } from '../db/schema.js';
import { ApiRoute } from '../http/api-route.js';
import type { HttpRequest } from '../http/http-types.js';
import { SESSION_ACCESS, type SessionAccess } from '../live/contracts.js';

/**
 * The operations view's backup status (backup-and-restore 3.2 step 8, 10.2; module-map 4.1 "Operations view";
 * PRD-SEC-013; S1-F14-T02): for whoever holds view on `kernel.backup_record`, which the request's guard authorises
 * (access-and-approvals 7.1 step 3). The last complete backup and the latest ones, complete or failed, as the backup
 * command recorded them in the Organisation's own database. Identifiers, times and kinds only: no record data, no key
 * (PRD-SEC-014). A failed backup is shown as failed and is never offered for restore.
 */
@Controller()
export class BackupStatusController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  @ApiRoute(routes.listBackups)
  async listBackups(@Req() request: HttpRequest): Promise<BackupStatus> {
    const session = this.moduleRef.get<SessionAccess>(SESSION_ACCESS, { strict: false }).signedInOf(request);
    return this.runner.read(
      {
        commandName: 'kernel.list-backups',
        organisation: session.organisation,
        correlationId: session.correlationId,
        actor: { kind: 'actor', actorId: session.userId },
      },
      async (context) => {
        const newest = [desc(backupRecord.finishedAt), desc(backupRecord.id)];
        const latest = await context.tx
          .select()
          .from(backupRecord)
          .orderBy(...newest)
          .limit(BACKUP_STATUS_CAP);
        const complete = await context.tx
          .select()
          .from(backupRecord)
          .where(eq(backupRecord.result, 'complete'))
          .orderBy(...newest)
          .limit(1);
        return {
          asOf: context.startedAt.toISOString(),
          lastComplete: complete[0] === undefined ? null : entryOf(complete[0]),
          backups: latest.map(entryOf),
        };
      },
    );
  }
}

function entryOf(row: typeof backupRecord.$inferSelect): BackupEntry {
  return {
    backupId: row.backupId,
    environment: row.environment as BackupEntry['environment'],
    snapshotAt: row.snapshotAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    result: row.result as BackupEntry['result'],
    failures: row.failures as BackupEntry['failures'],
    backupKeyVersion: row.backupKeyVersion,
  };
}
