import type { ErrorBody } from '@apparel-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionContext, type ShellSession } from '../shell/session';
import { KeptDraftBanner } from './KeptDraftBanner';
import { outcomeOfUnlock, UnlockForm } from './UnlockForm';

// SYNTHETIC values only (code-house-rules 11.1).
const reference = '01900000-0000-7000-8000-0000000000aa';
const refusal = (body: Omit<ErrorBody, 'reference'>): ErrorBody => ({ ...body, reference });
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const locked: ShellSession = {
  state: 'locked',
  user: {
    organisationCode: 'SYN-ORG-A',
    userId: '01900000-0000-7000-8000-0000000000a1',
    displayName: 'SYNTHETIC Admin',
    personasHeld: ['P-ADM'],
    roleAssignmentInForce: true,
    timeZone: 'UTC',
    idleLockSeconds: 900,
  },
  grants: [],
};

describe('the unlock form (access-and-approvals 3.3; PRD-ACS-017)', () => {
  it('asks for the password only, with Unlock as the one primary action and signing out instead', () => {
    const html = renderToStaticMarkup(
      <SessionContext value={{ session: locked, setSession: () => undefined }}>
        <UnlockForm />
      </SessionContext>,
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('current-password');
    expect(text(html)).toContain('Unlock');
    expect(text(html)).toContain('Sign out instead');
    expect(html).not.toContain('role="alert"');
  });

  it('RR-264 unlocks on success, signs out a session that ended meanwhile, and shows any other refusal', () => {
    expect(outcomeOfUnlock({ ok: true })).toEqual({ kind: 'unlocked' });
    for (const code of ['access.not-signed-in', 'access.session-not-found']) {
      const kind = code === 'access.not-signed-in' ? 'not-signed-in' : 'not-found';
      expect(outcomeOfUnlock({ ok: false, error: refusal({ kind, code }) })).toEqual({ kind: 'ended' });
    }
    const wrong = refusal({ kind: 'not-signed-in', code: 'access.sign-in-refused' });
    expect(outcomeOfUnlock({ ok: false, error: wrong })).toEqual({ kind: 'refused', refusal: wrong });
    const slowed = refusal({ kind: 'not-signed-in', code: 'access.sign-in-slowed' });
    expect(outcomeOfUnlock({ ok: false, error: slowed })).toEqual({ kind: 'refused', refusal: slowed });
  });
});

describe('the kept-draft offer (access-and-approvals 3.3; PRD-UXP-003)', () => {
  it('offers the input kept from the last session, to restore or discard', () => {
    const html = renderToStaticMarkup(<KeptDraftBanner onRestore={() => undefined} onDiscard={() => undefined} />);
    expect(text(html)).toContain('Unsaved input from your last session was kept on this device');
    expect(text(html)).toContain('Restore it');
    expect(text(html)).toContain('Discard it');
  });
});
