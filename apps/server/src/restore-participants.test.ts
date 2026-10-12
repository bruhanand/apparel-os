import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationSetFolder } from './kernel/index.js';
import { restoreRegistry } from './restore-participants.js';

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
