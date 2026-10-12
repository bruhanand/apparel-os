import { randomInt } from 'node:crypto';
import { expect } from 'vitest';
import { syntheticCode } from '../fixtures/synthetic.js';
import { writeSyntheticReason, type SyntheticUser } from './access.js';
import type { Call, DevicesWorld } from './billing-devices.js';

// The financial-year and bill-format changes as the tests drive them (offline-counter 4.3b; S1-F12-T03), shared by
// the series file and the concurrency and withdrawal file: preparing through the route, deciding through access's
// Decide route with a listed reason and a fresh code. The dates and the format are OPEN (GC5-1, RR-060; V-40,
// RR-101): every year, format, person and reason is SYNTHETIC.

export const PREPARE = [
  { recordType: 'pos.financial_year_change', action: 'view' },
  { recordType: 'pos.financial_year_change', action: 'create' },
  { recordType: 'pos.bill_format_change', action: 'view' },
  { recordType: 'pos.bill_format_change', action: 'create' },
] as const;

export const APPROVE = [
  { recordType: 'pos.financial_year_change', action: 'view' },
  { recordType: 'pos.financial_year_change', action: 'approve' },
  { recordType: 'pos.bill_format_change', action: 'view' },
  { recordType: 'pos.bill_format_change', action: 'approve' },
] as const;

export const yearLabel = () => syntheticCode(`FY-${String(randomInt(1_000_000))}`);
export const formatCode = () => syntheticCode(`BILL-${String(randomInt(1_000_000))}`);

export class NumberingChanges {
  approveReason = '';
  rejectReason = '';

  constructor(private readonly w: DevicesWorld) {}

  /** Writes the SYNTHETIC reasons a decision names; once the world has started. */
  async start(): Promise<void> {
    this.approveReason = await writeSyntheticReason(this.w.database, 'approve');
    this.rejectReason = await writeSyntheticReason(this.w.database, 'reject');
  }

  prepareYear(by: SyntheticUser, body: Record<string, unknown>): Promise<Call> {
    return this.w.post(by, '/api/pos/financial-year-changes', body);
  }

  prepareFormat(by: SyntheticUser, body: Record<string, unknown>): Promise<Call> {
    return this.w.post(by, '/api/pos/bill-format-changes', body);
  }

  /** A SYNTHETIC year from `first` to `last` days from today, prepared by `by`. */
  async preparedYear(by: SyntheticUser, first: number, last: number): Promise<Call & { label: string }> {
    const label = yearLabel();
    const call = await this.prepareYear(by, {
      label,
      firstDay: this.w.setup.day(first),
      lastDay: this.w.setup.day(last),
      origin: 'synthetic',
    });
    expect(call.status).toBe(200);
    return { ...call, label };
  }

  decide(prepared: Call, by: SyntheticUser, outcome: 'approve' | 'reject' = 'approve'): Promise<Call> {
    return this.w.post(by, `/api/access/approval-requests/${prepared.body.requestId as string}/decision`, {
      versionId: prepared.body.changeId,
      outcome,
      reason: { kind: 'listed', reasonId: outcome === 'approve' ? this.approveReason : this.rejectReason },
      totpCode: this.w.freshCode(by),
    });
  }

  withdraw(which: 'financial-year' | 'bill-format', changeId: unknown, by: SyntheticUser): Promise<Call> {
    return this.w.post(by, `/api/pos/${which}-changes/${String(changeId)}/withdraw`, {});
  }
}
