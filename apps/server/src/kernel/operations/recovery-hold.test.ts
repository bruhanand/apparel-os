import { describe, expect, it } from 'vitest';
import { measuredTimes } from './drill-record.js';
import { runsWhileHeld } from './recovery-hold.js';
import { storedAfterRecoveryPoint } from './restore-contract.js';

// S1-F14-T03: what runs while a restored Organisation is held, when an object counts as stored after the recovery
// point, and the drill record's measured times (backup-and-restore 4.3, 4.5, section 6; POL-18.03, POL-18.04).

describe('the recovery hold (backup-and-restore 4.3)', () => {
  it('POL-18.03 lets access commands, the recovery commands and the restore steps run, and no other command', () => {
    for (const allowed of [
      'access.sign-in',
      'access.revoke-user-sessions',
      'access.decide-approval',
      'configuration.reconcile-series-after-restore',
      'configuration.record-recovery-validation',
      'configuration.reopen-after-restore',
      'numbering.pause-series-after-restore',
      'audit.record-restore',
    ]) {
      expect(runsWhileHeld(allowed), allowed).toBe(true);
    }
    for (const refused of [
      'files-imports.store-file',
      'configuration.record-policy-signature',
      'finance.post-journal',
      'kernel.dispatch-event',
      'audit.seal-block',
      'accessx.anything',
    ]) {
      expect(runsWhileHeld(refused), refused).toBe(false);
    }
  });
});

describe('an object stored after the recovery point (backup-and-restore 3.3, 4.5)', () => {
  const point = new Date('2026-10-12T10:00:00.500Z');

  it('POL-18.04 counts an object of unknown time, or of the same second or later, as possible lost work', () => {
    expect(storedAfterRecoveryPoint(null, point)).toBe(true);
    expect(storedAfterRecoveryPoint(new Date('2026-10-12T10:00:00.000Z'), point)).toBe(true);
    expect(storedAfterRecoveryPoint(new Date('2026-10-12T10:00:03.000Z'), point)).toBe(true);
    expect(storedAfterRecoveryPoint(new Date('2026-10-12T09:59:59.000Z'), point)).toBe(false);
  });
});

describe('the drill record’s measured times (backup-and-restore section 6)', () => {
  const organisation = (recoveryPoint: string, reopenedAt: string | null) => ({
    organisationCode: 'SYN-ORG',
    organisationId: '01900000-0000-7000-8000-000000000001',
    recoveryPoint,
    databaseFrom: 'syn_a',
    databaseTo: 'syn_b',
    checks: [],
    gaps: [],
    gapsSettled: null,
    seriesToReconcile: 0,
    seriesReconciled: [],
    validations: [],
    reopened: reopenedAt === null ? null : { at: reopenedAt, byUserId: '01900000-0000-7000-8000-000000000002' },
    held: reopenedAt === null,
  });
  const base = {
    format: 'drill-record/1' as const,
    version: 1,
    writtenAt: '2026-10-12T11:00:00.000Z',
    restoreId: '01900000-0000-7000-8000-000000000003',
    environment: 'local' as const,
    conductedBy: 'SYNTHETIC operator',
    restoreStartedAt: '2026-10-12T10:30:00.000Z',
    backup: { backupId: '01900000-0000-7000-8000-000000000004', takenAt: '', codeCommit: null, backupKeyVersion: '' },
    steps: [],
    keyVersions: [],
  };

  it('measures the recovery time to the last reopening, from the start of a drill, and no data lost for a drill', () => {
    expect(
      measuredTimes({
        ...base,
        purpose: { kind: 'drill', note: 'SYNTHETIC' },
        organisations: [
          organisation('2026-10-12T10:00:00.000Z', '2026-10-12T10:40:00.000Z'),
          organisation('2026-10-12T10:00:00.000Z', '2026-10-12T10:45:00.000Z'),
        ],
      }),
    ).toEqual({ recoveryTimeSeconds: 900, dataLostSeconds: null });
  });

  it('measures a real restore from when the failure was declared, and the data lost from the earliest recovery point', () => {
    expect(
      measuredTimes({
        ...base,
        purpose: { kind: 'real', cause: 'SYNTHETIC', declaredAt: '2026-10-12T10:20:00.000Z' },
        organisations: [
          organisation('2026-10-12T10:00:00.000Z', null),
          organisation('2026-10-12T10:10:00.000Z', '2026-10-12T10:45:00.000Z'),
        ],
      }),
    ).toEqual({ recoveryTimeSeconds: null, dataLostSeconds: 1200 });
  });
});
