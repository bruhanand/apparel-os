import { describe, expect, it } from 'vitest';
import type { TransactionContext } from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import { Configuration } from './configuration.js';

// Who writes an activity grant (module-map 4.4 "Grant or withdraw an activity", "As built"; PRD-LIF-001; S1-F04
// review H4): only the decision effect of `site-lifecycle`, which the composition root hands the one writer at start,
// and only with the approval decision it is written in.

const configuration = () =>
  new Configuration({ audit: {} as AuditInterface, environment: { name: 'local' }, evidence: undefined });

const request = {
  activity: 'receiving' as const,
  siteId: '019a0000-0000-7000-8000-000000000001',
  businessUnitId: '019a0000-0000-7000-8000-000000000002',
  readinessRecordId: '019a0000-0000-7000-8000-000000000003',
};

describe('the activity grant writer (module-map 4.4; PRD-LIF-001)', () => {
  it('is handed out once: a second claim is a defect of the composition', () => {
    const gate = configuration();
    gate.claimActivityGrants();
    expect(() => gate.claimActivityGrants()).toThrow(/claimed once/);
  });

  it('refuses a grant with no approval decision', async () => {
    const writer = configuration().claimActivityGrants();
    await expect(
      writer.grant({} as TransactionContext, { userId: request.siteId, approvalDecisionId: '' }, request),
    ).rejects.toThrow(/approval decision/);
  });

  it('is not on the interface every module reaches', () => {
    expect('grantActivity' in configuration()).toBe(false);
  });
});
