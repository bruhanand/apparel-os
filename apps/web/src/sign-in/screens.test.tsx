import { Secret, type ErrorBody } from '@apparel-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionContext } from '../shell/session';
import { EnrolmentSecret, groupedKey } from './EnrolmentSecret';
import { keyToResend } from './resend';
import { RefusalBanner } from './RefusalBanner';
import { SignInScreens } from './SignInScreens';
import type { SignInStage } from './flow';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function render(initial: SignInStage) {
  return renderToStaticMarkup(
    <SessionContext value={{ session: { state: 'signed-out' }, setSession: () => undefined }}>
      <SignInScreens initial={initial} />
    </SessionContext>,
  );
}

// SYNTHETIC values only (code-house-rules 11.1).
const reference = '01900000-0000-7000-8000-0000000000aa';
const refusal = (body: Omit<ErrorBody, 'reference'>): ErrorBody => ({ ...body, reference });

describe('a refused password (access-and-approvals 3.2; S1-F01-T31)', () => {
  const banner = (missing: ErrorBody['missing']) =>
    text(
      renderToStaticMarkup(
        <RefusalBanner
          refusal={refusal({
            kind: 'refused',
            code: 'access.password-refused',
            ...(missing === undefined ? {} : { missing }),
          })}
        />,
      ),
    );

  it('names the rule it failed and what to do next, from the setting value the server gave', () => {
    const shown = banner([{ kind: 'password-rule', rule: 'minimum-length', minimumLength: '12' }]);
    expect(shown).toContain('This password does not meet the password rules. Choose another.');
    expect(shown).toContain('The password needs at least 12 characters.');
  });

  it('keeps the plain text when the server names no rule, or one this screen does not know', () => {
    expect(banner(undefined)).not.toContain('needs at least');
    expect(banner([{ kind: 'password-rule', rule: 'unknown-rule' }])).toContain('Something it needs is missing.');
    expect(banner([{ kind: 'password-rule', rule: 'minimum-length', minimumLength: 'x' }])).not.toContain(
      'needs at least',
    );
  });
});

describe('the sign-in form (access-and-approvals 3.1)', () => {
  it('PRD-SEC-001 asks for the Organisation code, login, password and authenticator code, with one primary action', () => {
    const html = render({ stage: 'sign-in' });
    expect(text(html)).toContain('Sign in');
    for (const label of ['Organisation code', 'Login', 'Password', 'Authenticator code']) {
      expect(text(html)).toContain(label);
    }
    expect(html).toMatch(/<input[^>]*autocomplete="current-password"[^>]*type="password"/i);
    expect(html).toMatch(/<input[^>]*autocomplete="one-time-code"[^>]*inputMode="numeric"/i);
    expect(html.match(/bg-accent text-on-accent/g)).toHaveLength(1);
  });

  it('access-and-approvals 3.1: a refused sign-in shows the one message that names no part, as an alert', () => {
    const html = render({
      stage: 'sign-in',
      refusal: refusal({ kind: 'not-signed-in', code: 'access.sign-in-refused' }),
    });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('The Organisation code, login, password or authenticator code is not right.');
  });

  it('code-house-rules 12.14: an unavailable sign-in names what is missing', () => {
    const html = render({
      stage: 'sign-in',
      refusal: refusal({
        kind: 'unavailable',
        code: 'access.sign-in-unavailable',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      }),
    });
    expect(text(html)).toContain('Sign-in is not available yet for this Organisation: a setting is missing.');
    expect(text(html)).toContain('A setting it needs is not set.');
  });
});

describe('enrolment and the password change (access-and-approvals 3.2)', () => {
  it('enrolment asks to set up an authenticator app before anything else', () => {
    const html = render({ stage: 'enrolment' });
    expect(text(html)).toContain('Set up your authenticator app');
    expect(text(html)).toContain('Show the setup key');
  });

  it('code-house-rules 12.6: the setup key is shown once, in groups of four, with the setup link', () => {
    const html = renderToStaticMarkup(
      <EnrolmentSecret
        secret={new Secret('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}
        otpauthUri={new Secret('otpauth://totp/SYNTHETIC?secret=ABCD')}
      />,
    );
    expect(text(html)).toContain('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567');
    expect(text(html)).toContain('shown only now');
    expect(html).toContain('href="otpauth://totp/SYNTHETIC?secret=ABCD"');
    expect(groupedKey('ABCDEFGHI')).toBe('ABCD EFGH I');
  });

  it('keeps each group of four unbroken and wraps only between groups (visual review finding 11)', () => {
    const html = renderToStaticMarkup(
      <EnrolmentSecret
        secret={new Secret('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}
        otpauthUri={new Secret('otpauth://totp/SYNTHETIC?secret=ABCD')}
      />,
    );
    const key = /<code[^>]*data-testid="enrolment-key"[^>]*>(.*?)<\/code>/s.exec(html);
    expect(key?.[0]).not.toContain('break-all');
    expect(key?.[1]).toContain(
      '<span class="whitespace-nowrap">ABCD</span> <span class="whitespace-nowrap">EFGH</span>',
    );
  });

  it('PRD-SEC-001 draws the setup link as a QR code in the page, with a text alternative to type the key (DEC-118; RR-280)', () => {
    const html = renderToStaticMarkup(
      <EnrolmentSecret
        secret={new Secret('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}
        otpauthUri={new Secret('otpauth://totp/SYNTHETIC?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}
      />,
    );
    const qr = /<svg[^>]*data-testid="enrolment-qr"[^>]*>.*?<\/svg>/s.exec(html)?.[0] ?? '';
    // An inline drawing: modules as a path, no image fetched from any address (PRD-SEC-014).
    expect(qr).toMatch(/<path[^>]* d="M/);
    expect(qr).not.toMatch(/href|src=|https?:/);
    expect(qr).toContain('role="img"');
    expect(qr).toContain('aria-label="QR code of the setup link. If you cannot scan it, type the setup key instead."');
    // The manual fallback stays beside it.
    expect(text(html)).toContain('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567');
  });

  it('the password change asks for the new password twice and a fresh authenticator code', () => {
    const html = render({ stage: 'password-change' });
    expect(text(html)).toContain('Choose your own password');
    expect(text(html)).toContain('New password');
    expect(text(html)).toContain('New password again');
    expect(text(html)).toContain('Authenticator code');
    expect(html).toMatch(/autocomplete="new-password"/i);
  });
});

describe('keyToResend (code-house-rules 12.4)', () => {
  const failed = (code: string) => ({
    ok: false as const,
    status: 503,
    replayed: false,
    idempotencyKey: 'key-1',
    error: refusal({ kind: 'failed', code }),
  });

  it('keeps the key only when it is not known whether the command ran, so the resend is never applied twice', () => {
    expect(keyToResend(failed('kernel.outcome-unknown'))).toBe('key-1');
    expect(keyToResend(failed('kernel.timed-out'))).toBe('key-1');
    expect(keyToResend(failed('kernel.request-in-progress'))).toBe('key-1');
    expect(keyToResend(failed('access.authenticator-code-refused'))).toBeUndefined();
    expect(keyToResend({ ok: true, idempotencyKey: 'key-1' })).toBeUndefined();
  });
});
