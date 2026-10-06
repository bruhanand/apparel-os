import { describe, expect, it } from 'vitest';
import { AUDIT_CHANGES_FORMAT, auditChanges, AuditChangeRefused, readAuditChanges } from './changes.js';

// SYNTHETIC identifiers and values of this file only.
const VERSION_OLD = '01900000-0000-7000-8000-0000000e0001';
const VERSION_NEW = '01900000-0000-7000-8000-0000000e0002';

describe('auditChanges: the before and after values an audit record keeps (numbering-and-audit 4.1, 4.3)', () => {
  it('PRD-ACS-013 keeps the changed fields with their before and after values, under a named format', () => {
    const stored = auditChanges([
      { kind: 'value', field: 'displayName', before: 'SYNTHETIC Old', after: 'SYNTHETIC New' },
      { kind: 'value', field: 'state', before: null, after: 'Active' },
    ]);
    expect(stored.format).toBe('audit-changes/1');
    expect(stored.format).toBe(AUDIT_CHANGES_FORMAT);
    expect(stored.changes).toEqual([
      { kind: 'value', field: 'displayName', before: 'SYNTHETIC Old', after: 'SYNTHETIC New' },
      { kind: 'value', field: 'state', before: null, after: 'Active' },
    ]);
  });

  it('PRD-ACS-008 keeps a restricted value with its field class, so it is shown only under field permission', () => {
    const stored = auditChanges([{ kind: 'restricted', field: 'cost', fieldClass: 'cost', before: 100, after: 120 }]);
    expect(stored.changes).toEqual([
      { kind: 'restricted', field: 'cost', fieldClass: 'cost', before: 100, after: 120 },
    ]);
  });

  it('numbering-and-audit 7 test 11 PRD-SEC-006 an encrypted value is kept only as the versions that held it', () => {
    const stored = auditChanges([
      {
        kind: 'encrypted',
        field: 'bankAccount',
        fieldClass: 'bank-details',
        before: { kind: 'version', versionId: VERSION_OLD },
        after: { kind: 'version', versionId: VERSION_NEW },
      },
      {
        kind: 'encrypted',
        field: 'authenticatorSecret',
        fieldClass: 'authenticator-secret',
        before: { kind: 'not-kept' },
        after: { kind: 'not-kept' },
      },
    ]);
    expect(stored.changes).toEqual([
      {
        kind: 'encrypted',
        field: 'bankAccount',
        fieldClass: 'bank-details',
        before: { kind: 'version', versionId: VERSION_OLD },
        after: { kind: 'version', versionId: VERSION_NEW },
      },
      {
        kind: 'encrypted',
        field: 'authenticatorSecret',
        fieldClass: 'authenticator-secret',
        before: { kind: 'not-kept' },
        after: { kind: 'not-kept' },
      },
    ]);
  });

  it('RR-210 PRD-SEC-014 a password or session identifier hash is kept only as the fact that it changed', () => {
    const stored = auditChanges([{ kind: 'secret', field: 'passwordHash' }]);
    expect(stored.changes).toEqual([{ kind: 'secret', field: 'passwordHash' }]);
  });

  it('PRD-SEC-006 refuses an encrypted change that carries a value', () => {
    expect(() =>
      auditChanges([
        // A caller slipping the value in beside the versions.
        {
          kind: 'encrypted',
          field: 'bankAccount',
          fieldClass: 'bank-details',
          before: { kind: 'absent' },
          after: { kind: 'version', versionId: VERSION_NEW },
          value: 'SYNTHETIC-0000',
        } as never,
      ]),
    ).toThrow(AuditChangeRefused);
  });

  it('PRD-SEC-014 refuses a value that holds an Argon2 hash, anywhere in it', () => {
    const hash = '$argon2id$v=19$m=65536,t=3,p=4$SYNTHETICsalt$SYNTHETIChash';
    expect(() => auditChanges([{ kind: 'value', field: 'credential', before: null, after: hash }])).toThrow(
      AuditChangeRefused,
    );
    expect(() =>
      auditChanges([{ kind: 'value', field: 'nested', before: null, after: { list: ['x', { deep: hash }] } }]),
    ).toThrow(AuditChangeRefused);
  });

  it('refuses the same field twice, and a field with no name', () => {
    expect(() =>
      auditChanges([
        { kind: 'value', field: 'state', before: null, after: 'Active' },
        { kind: 'secret', field: 'state' },
      ]),
    ).toThrow(AuditChangeRefused);
    expect(() => auditChanges([{ kind: 'secret', field: '' }])).toThrow(AuditChangeRefused);
  });

  it('reads back what it stored, and refuses another format', () => {
    const stored = auditChanges([{ kind: 'secret', field: 'passwordHash' }]);
    expect(readAuditChanges(stored.format, JSON.parse(JSON.stringify(stored.changes)))).toEqual(stored.changes);
    expect(() => readAuditChanges('audit-changes/0', stored.changes)).toThrow(AuditChangeRefused);
  });
});
