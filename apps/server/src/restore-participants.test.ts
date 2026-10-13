import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { permissionRegistry } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { migrationSetFolder, PinoLoggerService, restoreIdentityAuthorities } from './kernel/index.js';
import { OrganisationKeys } from './modules/access/index.js';
import { Audit } from './modules/audit/index.js';
import { restoreRegistry } from './restore-participants.js';
import { RESTORE_IDENTITY_AUTHORITIES, restoreStepsOf } from './restore-steps.js';

// S1-F14-T02: every table an Organisation database holds belongs to exactly one restore participant, so the backup's
// control totals and the restore's checks leave none out (backup-and-restore 3.2 step 2, 5.1, 10.1; PRD-ACP-019).
describe('the restore participants (backup-and-restore 10.1, 10.2)', () => {
  it('PRD-ACP-019 cover every table of the Organisation set’s register, each once', () => {
    const register = JSON.parse(readFileSync(join(migrationSetFolder('organisation'), 'tables.json'), 'utf8')) as {
      tables: { table: string }[];
    };
    const owned = restoreRegistry.tables();
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.filter((table) => !table.startsWith('pgboss.'))).toEqual(
      register.tables.map((entry) => entry.table).sort(),
    );
  });

  // S1-F14-T04 (RR-541): a file is attached to a record under its declared record type (imports-and-opening-data 11,
  // 13.1), and the restore follows every attachment to a participant answering for that type (5.1). A type no
  // participant answers for leaves every restore of an Organisation holding such an attachment held, as
  // `configuration.policy_status` did until S1-F14-T04. So every declared record type is answered for, by a table of
  // that name or a participant's `records`, except the types below: each authorises a command or a reading over records
  // kept under another type, and no file is attached to it (every caller of Attach checked, 13 Oct 2026). A type that
  // starts taking attachments leaves this list and gains its participant's answer.
  const NOT_ATTACHED: Readonly<Record<string, string>> = {
    'access.user_credential': 'resetting a user’s credentials, kept on access.user',
    'audit.sensitive_access_record': 'reading audit.access_record rows of restricted values',
    'audit.device_access_record': 'reading audit.access_record rows of billing devices',
    'audit.audit_partition': 'audit’s partitions, no record of its own',
    'files_imports.opening_stock': 'approving an opening-stock files_imports.import_batch',
    'files_imports.opening_balances': 'approving an opening-balances files_imports.import_batch',
    'configuration.capability': 'switching a capability, kept in configuration.capability_change',
    'configuration.series_reconciliation': 'reconciling a series after a restore, kept as kernel recovery events',
    'configuration.reopening': 'reopening after a restore, kept as kernel recovery events',
    'finance.tax_rule': 'tax rules, kept in finance.tax_rate_rule and its versions',
  };

  it('PRD-ACP-019 answer for every declared record type a file can be attached to (RR-541)', () => {
    const answered = new Set(restoreRegistry.tables());
    for (const participant of restoreRegistry.participants) {
      for (const record of participant.records ?? []) answered.add(record.recordType);
    }
    const declared = permissionRegistry.map((declaration) => declaration.code);
    expect(declared.filter((type) => !answered.has(type) && NOT_ATTACHED[type] === undefined)).toEqual([]);
    // The list holds no type that is answered for, or that is no longer declared.
    expect(Object.keys(NOT_ATTACHED).filter((type) => answered.has(type) || !declared.includes(type))).toEqual([]);
  });

  it('runs in tier order, kernel first', () => {
    const tiers = restoreRegistry.participants.map((participant) => participant.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(restoreRegistry.participants[0]?.unit).toBe('kernel');
  });
});

describe('the restore identity (access-and-approvals 2.3, 9.11; backup-and-restore 10.5)', () => {
  it('PRD-SEC-018 holds exactly what the restore steps declare, as the static list names it', () => {
    const steps = restoreStepsOf({
      audit: new Audit(new PinoLoggerService()),
      keys: OrganisationKeys.fromKeptCopies('{}'),
    });
    const key = (authority: { action: string; recordType: string }) => `${authority.action} ${authority.recordType}`;
    expect(restoreIdentityAuthorities(steps).map(key).sort()).toEqual(RESTORE_IDENTITY_AUTHORITIES.map(key).sort());
  });
});
