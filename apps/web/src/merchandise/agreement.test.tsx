import type { AgreementRecord } from '@apparel-os/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Grant } from '../shell/screens';
import { SessionContext, type ShellSession } from '../shell/session';
import { AgreementForm, AgreementView } from './AgreementScreen';

// S2-F01-T01: Setup › Agreement without the default model for new bookings (structure-and-masters 5.2, 8; DEC-129,
// POL-01.02; RR-545): every booking takes the agreement's commercial model, so neither the form nor the terms offer
// another. Every value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const id = (n: number) => `0199b3c4-5d6e-7f80-91a2-b3c4d5e6${n.toString(16).padStart(4, '0')}`;
const grants: Grant[] = (['view', 'create', 'edit'] as const).map((action) => ({
  recordType: 'merchandise.agreement',
  action,
}));

function render(node: ReactNode) {
  const session: ShellSession = {
    state: 'active',
    user: {
      organisationCode: 'SYN-ORG-A',
      userId: id(1),
      displayName: 'SYNTHETIC Booking',
      personasHeld: ['P-BKG'],
      roleAssignmentInForce: true,
      timeZone: 'UTC',
      idleLockSeconds: 900,
    },
    grants,
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <SessionContext value={{ session, setSession: () => undefined }}>{node}</SessionContext>
    </QueryClientProvider>,
  );
}

const agreement: AgreementRecord = {
  id: id(2),
  code: 'SYN-AGR-1',
  counterparty: { kind: 'supplier', partyId: id(3) },
  versionToken: id(4),
  versions: [
    {
      id: id(4),
      validFrom: '2026-01-01',
      state: 'In force',
      terms: {
        commercialModel: 'outright',
        ownershipEvent: { kind: 'receipt-and-acceptance' },
        returnRights: { allowed: false, window: null, startsAt: null },
        returnConditions: {
          conditionTags: null,
          packagingLimits: null,
          quantityLimits: null,
          supplierApproval: null,
          freightAndDeductions: null,
          settlement: null,
        },
        commissions: null,
        paymentTerms: 'SYNTHETIC payment terms',
        creditNoteTerms: null,
        promotionTerms: null,
        cashDiscount: { rate: null, days: null, from: null },
        interest: { rate: null, days: null, from: null },
      },
      margins: { kind: 'masked' },
      signedAgreement: [],
    },
  ],
};

describe('Setup › Agreement (structure-and-masters 5.2, 8; DEC-129)', () => {
  it('DEC-129 POL-01.02 asks a new agreement for its commercial model and for no default model for new bookings', () => {
    const shown = text(render(<AgreementForm />));
    expect(shown).toContain('Commercial model');
    expect(shown).toContain('Ownership-transfer event');
    expect(shown).not.toContain('Default model');
  });

  it('DEC-129 POL-01.02 shows the terms in force with their commercial model and no default model', () => {
    const shown = text(render(<AgreementView agreement={agreement} />));
    expect(shown).toContain('Commercial model Outright');
    expect(shown).toContain('SYNTHETIC payment terms');
    expect(shown).not.toContain('Default model');
  });
});
