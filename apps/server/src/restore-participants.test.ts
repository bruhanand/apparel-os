import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
