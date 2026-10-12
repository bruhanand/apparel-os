import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as accessTables from './db/schema.js';

/**
 * Access's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables, the
 * records others refer to (users, roles, role assignments, service identities, approval decisions and uses, devices,
 * approval requests), and the key versions its authenticator secrets name (2.3). Its after-restore step, ending every
 * session, is S1-F14-T03's.
 */
export const accessRestoreParticipant: RestoreParticipant = {
  unit: 'access',
  tier: 1,
  tables: tablesOf(accessTables),
  records: [
    { recordType: 'access.user', table: 'access.app_user', suffixes: ['user_id'] },
    { recordType: 'access.role', table: 'access.role', suffixes: ['role_id'] },
    { recordType: 'access.role_assignment', table: 'access.role_assignment', suffixes: ['role_assignment_id'] },
    { recordType: 'access.service_identity', table: 'access.service_identity', suffixes: ['service_identity_id'] },
    { recordType: 'access.approval_decision', table: 'access.approval_decision', suffixes: ['approval_decision_id'] },
    { recordType: 'access.approval_use', table: 'access.approval_use', suffixes: ['approval_use_id'] },
    { recordType: 'access.device', table: 'access.device', suffixes: ['device_id'] },
  ],
  notReferences: {
    'access.effective_grant.actor_id': 'a user or a service identity',
  },
  async keyVersions(context) {
    const rows = await context.tx.execute<{ identifier: string | null; uses: string }>(
      sql`select secret_key_version as identifier, count(*)::text as uses
            from access.second_factor group by 1`,
    );
    return rows.rows.map((row) => ({ identifier: row.identifier, uses: Number(row.uses) }));
  },
  async invariants(context) {
    // Every key version an authenticator secret names is one the Organisation lists (2.4).
    const rows = await context.tx.execute<{ checked: string; failed: string }>(
      sql`select count(*)::text as checked,
                 count(*) filter (where not exists (
                   select 1 from access.key_version k where k.identifier = f.secret_key_version))::text as failed
            from access.second_factor f where f.secret_key_version is not null`,
    );
    const row = rows.rows[0];
    const failed = Number(row?.failed ?? 0);
    return [
      {
        check: 'access.second_factor.secret_key_version is listed',
        passed: failed === 0,
        checked: Number(row?.checked ?? 0),
        failed,
      },
    ];
  },
};
