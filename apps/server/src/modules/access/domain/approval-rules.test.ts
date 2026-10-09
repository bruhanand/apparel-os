import { registryByCode } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_COMPOSITION } from '../../../kernel/index.js';
import { approvalRulesOf, effectsOf, type ApprovalRule, type DocumentEffect } from './approval-rules.js';

// The approval rules and decision effects other modules declare (access-and-approvals 8, 9.8a, 9.8b), checked once at
// start (code-house-rules 12.14).

const effect: DocumentEffect = {
  targets: () => Promise.resolve([]),
  approve: () => Promise.resolve({ kind: 'success', answer: {} }),
  reject: () => Promise.resolve({ kind: 'success', answer: {} }),
};

const siteRule: ApprovalRule = {
  actionType: 'organisation.site.change',
  module: 'organisation',
  recordType: 'organisation.site',
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
};

describe('module approval rules and their decision effects', () => {
  const registry = registryByCode();

  it('PRD-ACS-006 accepts a master change of a module, approved on its own record type', () => {
    const rules = approvalRulesOf([siteRule], PRODUCTION_COMPOSITION, registry);
    expect(rules.get('organisation.site.change')).toEqual(siteRule);
    expect(effectsOf(new Map([['organisation.site.change', effect]]), rules).size).toBe(1);
  });

  it('fails the start for an effect that names no module rule, or an access rule', () => {
    const rules = approvalRulesOf([siteRule], PRODUCTION_COMPOSITION, registry);
    expect(() => effectsOf(new Map([['organisation.store.change', effect]]), rules)).toThrow(/names no module/);
    expect(() => effectsOf(new Map([['access.role.change', effect]]), rules)).toThrow(/names no module/);
  });
});
