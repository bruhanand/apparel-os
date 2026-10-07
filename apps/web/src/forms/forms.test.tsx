import { routes } from '@apparel-os/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FormField, issueMessage } from './FormField';
import { startsInPast, STARTS_BEFORE_TOMORROW, STARTS_IN_PAST, withStartDateChecks } from './start-date';
import { routeResolver } from './use-route-form';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('FormField (design-language 10.7)', () => {
  it('shows the label, the required mark with its word for screen readers, and the control', () => {
    const html = renderToStaticMarkup(
      <FormField id="login" label="screen.setup.users" required>
        <input id="login" />
      </FormField>,
    );
    expect(text(html)).toBe('Users * Required');
    expect(html).toContain('for="login"');
  });

  it('shows an error below the field as "! message" from the issue code, never the input', () => {
    const html = renderToStaticMarkup(
      <FormField id="login" label="screen.setup.users" error={{ type: 'too_small' }}>
        <input id="login" />
      </FormField>,
    );
    expect(text(html)).toBe('Users ! This is too short or too small.');
    expect(html).toContain('id="login-error"');
  });
});

describe('forms with Zod (PRD Stack: Web, React Hook Form and Zod)', () => {
  it('the resolver reports Zod issue codes, which the catalogue turns into text', async () => {
    const resolver = zodResolver(z.strictObject({ login: z.string().min(1) }));
    const result = await resolver({ login: '' }, undefined, { fields: {}, shouldUseNativeValidation: false });
    const type = result.errors.login?.type;
    expect(type).toBe('too_small');
    expect(issueMessage(type)).toBe('issue.too_small');
    expect(issueMessage('a-code-it-does-not-know')).toBe('issue.custom');
  });
});

describe('routeResolver (code-house-rules 12.2; PRD-SEC-014)', () => {
  it('checks a body with its route schema but hands on what was typed, so a secret is sent, never "[secret]"', async () => {
    const result = await routeResolver(routes.signIn)(
      { organisationCode: 'SYN-ORG-A', login: 'SYN-USER-A', password: 'SYNTHETIC-typed' },
      undefined,
      { fields: {}, shouldUseNativeValidation: false },
    );
    expect(result.errors).toEqual({});
    expect(JSON.stringify(result.values)).toBe(
      '{"organisationCode":"SYN-ORG-A","login":"SYN-USER-A","password":"SYNTHETIC-typed"}',
    );
  });
});

// S1-F01-T34: a start date before the Organisation's today says so (design-language 8, 10.7). Every value is SYNTHETIC.
describe('the start-date check (S1-F01-T34; access.starts-in-past)', () => {
  const options = { fields: {}, shouldUseNativeValidation: false };
  const schema = z.strictObject({ code: z.string().min(1), validFrom: z.string().min(1) });
  const resolver = withStartDateChecks(routeResolver({ body: schema }), [
    { path: 'validFrom', earliest: '2026-10-07' },
  ]);

  it('refuses a day before the earliest day, and nothing from that day on', () => {
    expect(startsInPast('2026-10-06', '2026-10-07')).toBe(true);
    expect(startsInPast('2026-10-07', '2026-10-07')).toBe(false);
    expect(startsInPast('2026-10-08', '2026-10-07')).toBe(false);
    expect(startsInPast('2025-12-31', '2026-01-01')).toBe(true);
  });

  it('leaves an empty or missing value to the route schema, as a browser that rejects a typed date hands one on', () => {
    expect(startsInPast('', '2026-10-07')).toBe(false);
    expect(startsInPast(undefined, '2026-10-07')).toBe(false);
  });

  it('fails the field with the server’s own code, which the catalogue turns into the existing message', async () => {
    const result = await resolver({ code: 'SYN-R', validFrom: '2026-10-06' }, undefined, options);
    expect(result.errors.validFrom?.type).toBe(STARTS_IN_PAST);
    expect(issueMessage(STARTS_IN_PAST)).toBe('error.access.starts-in-past');
    const html = renderToStaticMarkup(
      <FormField id="from" label="setup.valid-from" error={result.errors.validFrom}>
        <input id="from" />
      </FormField>,
    );
    expect(text(html)).toContain('! The start date is in the past. Choose today or a later date.');
  });

  it('passes today and later days, and keeps the schema’s own findings', async () => {
    expect((await resolver({ code: 'SYN-R', validFrom: '2026-10-07' }, undefined, options)).errors).toEqual({});
    const both = await resolver({ code: '', validFrom: '2026-10-06' }, undefined, options);
    expect(both.errors.code?.type).toBe('too_small');
    expect(both.errors.validFrom?.type).toBe(STARTS_IN_PAST);
    const empty = await resolver({ code: 'SYN-R', validFrom: '' }, undefined, options);
    expect(empty.errors.validFrom?.type).toBe('too_small');
  });

  it('checks a nested field only when it applies, and may name the day after today as its earliest', async () => {
    const nested = withStartDateChecks(
      routeResolver({
        body: z.strictObject({
          takesEffect: z.strictObject({ kind: z.string(), date: z.string().optional() }),
        }),
      }),
      [
        {
          path: 'takesEffect.date',
          earliest: '2026-10-08',
          when: (values) => values.takesEffect.kind === 'from-date',
        },
      ],
    );
    const today = await nested({ takesEffect: { kind: 'from-date', date: '2026-10-07' } }, undefined, options);
    expect(today.errors.takesEffect?.date?.type).toBe(STARTS_IN_PAST);
    const unused = await nested({ takesEffect: { kind: 'at-decision', date: '2026-10-01' } }, undefined, options);
    expect(unused.errors).toEqual({});
  });

  it('code-house-rules 7.3 says a security setting must start tomorrow or later, since the server refuses today too', async () => {
    const security = withStartDateChecks(routeResolver({ body: z.strictObject({ date: z.string().min(1) }) }), [
      { path: 'date', earliest: '2026-10-08', code: STARTS_BEFORE_TOMORROW },
    ]);
    const today = await security({ date: '2026-10-07' }, undefined, options);
    expect(today.errors.date?.type).toBe(STARTS_BEFORE_TOMORROW);
    const html = renderToStaticMarkup(
      <FormField id="from" label="setup.valid-from" error={today.errors.date}>
        <input id="from" />
      </FormField>,
    );
    expect(text(html)).toContain('! The change must start tomorrow or later.');
    expect(text(html)).not.toContain('past');
    expect((await security({ date: '2026-10-08' }, undefined, options)).errors).toEqual({});
  });
});
