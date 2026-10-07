import type { AccessHistoryEntry, AuditHistoryEntry } from '@apparel-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessRecordTable } from './AccessRecordTable';
import { AsOf } from './AsOf';
import { AuditLogScreen } from './AuditLogScreen';
import { formatDateTime } from './format';
import { HistoryTimeline } from './HistoryTimeline';
import { auditLogTabs } from './tabs';

// S1-F01-T18: the history screens' parts (numbering-and-audit 4.5, 5; design-language 8, 10.4, 10.6, 10.9). Every
// value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const USER = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701';
const SERVICE = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f702';

function entry(overrides: Partial<AuditHistoryEntry> = {}): AuditHistoryEntry {
  return {
    id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f710',
    recordedAt: '2026-09-23T10:42:00.000Z',
    occurredAt: '2026-09-23T10:42:00.000Z',
    businessDate: '2026-09-23',
    actor: { kind: 'user', id: USER, name: 'SYNTHETIC Meera' },
    onBehalfOf: null,
    recordType: 'access.role_assignment',
    recordId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f720',
    versionId: null,
    operation: 'approve-role-assignment',
    changes: [],
    reason: 'SYNTHETIC reason',
    source: { kind: 'screen', reference: null, row: null },
    approvalDecisionId: null,
    correlationId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f730',
    ...overrides,
  };
}

describe('formatDateTime (design-language 8)', () => {
  it('writes DD MMM YYYY, HH:mm on the 24-hour clock', () => {
    expect(formatDateTime('2026-09-23T15:07:00.000Z', 'UTC')).toBe('23 Sep 2026, 15:07');
    expect(formatDateTime('2026-01-05T00:00:00.000Z', 'Asia/Kolkata')).toBe('05 Jan 2026, 05:30');
  });
});

describe('AsOf (design-language 10.4; PRD-PRF-004)', () => {
  it('names the time the rows were read', () => {
    expect(text(renderToStaticMarkup(<AsOf asOf="2026-09-23T10:42:00.000Z" timeZone="UTC" />))).toBe(
      'as of 23 Sep 2026, 10:42',
    );
  });
});

describe('HistoryTimeline (numbering-and-audit 4.1, 4.3; PRD-ACS-013)', () => {
  it('shows who did what, when, with the reason and the version', () => {
    const html = renderToStaticMarkup(
      <HistoryTimeline entries={[entry({ versionId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f740' })]} timeZone="UTC" />,
    );
    expect(text(html)).toContain('23 Sep 2026, 10:42');
    expect(text(html)).toContain('SYNTHETIC Meera');
    expect(text(html)).toContain('Approved a role assignment');
    expect(text(html)).toContain('Reason SYNTHETIC reason');
    // A version is shortened to its last six characters, the whole identifier kept as its title (finding 5).
    expect(text(html)).toContain('Version …E6F740');
    expect(html).toContain('title="0199b3c4-5d6e-7f80-91a2-b3c4d5e6f740"');
  });

  it('names a job by its identity and the person it acted for, and an operation it has no words for by its code', () => {
    const html = renderToStaticMarkup(
      <HistoryTimeline
        entries={[
          entry({
            actor: { kind: 'service-identity', id: SERVICE, name: 'outbox' },
            onBehalfOf: { kind: 'user', id: USER, name: null },
            operation: 'syn-new-operation',
          }),
        ]}
        timeZone="UTC"
      />,
    );
    expect(text(html)).toContain('outbox on behalf of Unknown');
    expect(text(html)).toContain('syn-new-operation');
  });

  it('PRD-ACS-008 shows a masked value as Restricted, never a value, and an encrypted or secret field only as changed', () => {
    const html = renderToStaticMarkup(
      <HistoryTimeline
        entries={[
          entry({
            changes: [
              { kind: 'value', field: 'name', before: null, after: 'SYNTHETIC role' },
              { kind: 'masked', field: 'cost', fieldClass: 'cost' },
              { kind: 'restricted', field: 'margin', fieldClass: 'margin', before: 1, after: 2 },
              {
                kind: 'encrypted',
                field: 'bank',
                fieldClass: 'bank-details',
                before: { kind: 'absent' },
                after: { kind: 'not-kept' },
              },
              { kind: 'secret', field: 'password' },
            ],
          }),
        ]}
        timeZone="UTC"
      />,
    );
    const shown = text(html);
    expect(shown).toContain('Name empty → SYNTHETIC role');
    expect(shown).toContain('cost 🔒 Restricted');
    expect(html).toContain('aria-label="cost: Restricted"');
    expect(shown).toContain('margin 1 → 2');
    expect(shown).toContain('bank Changed. The value is kept encrypted and is never shown here.');
    expect(shown).toContain('Password Changed. Only the fact of the change is kept.');
  });

  it('code-house-rules 12.13 names each field from the catalogue and writes each value as the screens do (visual review finding 5)', () => {
    const ROLE = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7d1';
    const OTHER_ROLE = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7d2';
    const version = { id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a1', validFrom: '2026-10-07', state: 'In force' as const };
    const html = renderToStaticMarkup(
      <HistoryTimeline
        entries={[
          entry({
            changes: [
              { kind: 'value', field: 'displayName', before: null, after: 'SYNTHETIC History reader' },
              { kind: 'value', field: 'personas', before: null, after: ['P-AUD'] },
              { kind: 'value', field: 'actor', before: null, after: { kind: 'user', userId: USER } },
              { kind: 'value', field: 'roleId', before: OTHER_ROLE, after: ROLE },
              {
                kind: 'value',
                field: 'scope',
                before: null,
                after: {
                  kind: 'dimensions',
                  legalEntity: { kind: 'all' },
                  place: { kind: 'all' },
                  brand: { kind: 'all' },
                },
              },
              { kind: 'value', field: 'validFrom', before: null, after: '2026-10-07' },
              { kind: 'value', field: 'validTo', before: null, after: null },
            ],
          }),
        ]}
        timeZone="UTC"
        lists={{
          users: {
            asOf: '2026-10-07T10:00:00.000Z',
            users: [
              {
                id: USER,
                login: 'syn-meera',
                versions: [{ ...version, displayName: 'SYNTHETIC Meera', personas: [], userState: 'Active' }],
              },
            ],
          },
          roles: {
            asOf: '2026-10-07T10:00:00.000Z',
            roles: [
              {
                id: ROLE,
                code: 'SYN-AUDIT',
                selfService: false,
                versions: [{ ...version, name: 'SYNTHETIC auditor', permissions: [] }],
              },
            ],
          },
        }}
      />,
    );
    const shown = text(html);
    expect(shown).toContain('Display name empty → SYNTHETIC History reader');
    expect(shown).toContain('Personas held empty → P-AUD Auditor');
    expect(shown).toContain('Person empty → SYNTHETIC Meera');
    expect(shown).toContain('Role a role you may not view → SYN-AUDIT · SYNTHETIC auditor');
    expect(shown).toContain('Scope empty → Legal entity: All members · Place: All members · Brand: All members');
    expect(shown).toContain('Valid from empty → 07 Oct 2026');
    expect(shown).toContain('Valid to no end → no end');
    for (const code of ['displayName', 'roleId', 'validFrom', '"kind"', '[', USER]) expect(shown).not.toContain(code);
  });
});

describe('AccessRecordTable (numbering-and-audit 5.2)', () => {
  it('lists each access record with its time, kind, outcome, user and address', () => {
    const rows: AccessHistoryEntry[] = [
      {
        id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f750',
        recordedAt: '2026-09-23T10:42:00.000Z',
        occurredAt: '2026-09-23T10:42:00.000Z',
        kind: 'sign-in',
        outcome: 'refused',
        user: null,
        deviceId: null,
        networkAddress: '10.9.9.18',
        identityVerification: null,
        auditRecordId: null,
        change: null,
        record: null,
        fieldClass: null,
        exposure: null,
        correlationId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f760',
      },
    ];
    const shown = text(renderToStaticMarkup(<AccessRecordTable entries={rows} timeZone="UTC" />));
    expect(shown).toContain('23 Sep 2026, 10:42 Sign-in Refused No user matched 10.9.9.18');
    // Every row's Detail says something: here, that it came from no registered device (finding 8).
    expect(shown).toContain('10.9.9.18 Not a registered device');
  });

  it('labels a permission change plainly: whose access, what changed, or where to read it (visual review finding 8)', () => {
    const base: AccessHistoryEntry = {
      id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f751',
      recordedAt: '2026-09-23T10:42:00.000Z',
      occurredAt: '2026-09-23T10:42:00.000Z',
      kind: 'permission-changed',
      outcome: 'succeeded',
      user: null,
      deviceId: null,
      networkAddress: null,
      identityVerification: null,
      auditRecordId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f770',
      change: { recordType: 'access.role', operation: 'approve-role-version' },
      record: null,
      fieldClass: null,
      exposure: null,
      correlationId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f761',
    };
    const shown = text(
      renderToStaticMarkup(
        <AccessRecordTable
          entries={[
            base,
            {
              ...base,
              id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f752',
              change: null,
              user: { kind: 'user', id: USER, name: 'SYNTHETIC Meera' },
            },
          ]}
          timeZone="UTC"
        />,
      ),
    );
    expect(shown).toContain('Permission changed Succeeded Not one user Role · Approved a role version');
    expect(shown).toContain('Permission changed Succeeded SYNTHETIC Meera');
    expect(shown).toContain('What changed is in Changes, where your role assignments cover the record.');
    expect(shown).not.toContain('No user matched');
  });
});

describe('the audit log tabs (ui-blueprint Setup › Audit log)', () => {
  it('shows only the tabs the role assignments grant', () => {
    expect(auditLogTabs([{ recordType: 'audit.audit_record', action: 'view' }])).toEqual(['changes']);
    expect(
      auditLogTabs([
        { recordType: 'audit.audit_record', action: 'view' },
        { recordType: 'audit.access_record', action: 'view' },
        { recordType: 'audit.sensitive_access_record', action: 'view' },
      ]),
    ).toEqual(['changes', 'sign-ins', 'sensitive-access']);
  });
});

describe('AuditLogScreen (ui-blueprint Setup › Audit log)', () => {
  it('opens on Changes, asking what to read, with the kinds of record the reader may view', () => {
    const html = renderToStaticMarkup(
      <AuditLogScreen
        grants={[
          { recordType: 'audit.audit_record', action: 'view' },
          { recordType: 'access.role_assignment', action: 'view' },
          { recordType: 'audit.access_record', action: 'view' },
        ]}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Changes</);
    expect(text(html)).toContain('Sign-ins');
    expect(text(html)).not.toContain('Sensitive access');
    expect(html).toContain('<option value="access.role_assignment">Role assignment</option>');
    expect(text(html)).toContain('Choose what to read');
  });
});
