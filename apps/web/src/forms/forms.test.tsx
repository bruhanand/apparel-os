import { routes } from '@apparel-os/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FormField, issueMessage } from './FormField';
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
