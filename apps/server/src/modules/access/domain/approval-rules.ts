import type { AccessActionType, FieldClass, MoneyBasis, RecordTypeDeclaration } from '@apparel-os/schemas';
import type { CommandRefusal, Composition, LockTarget, TransactionContext } from '../../../kernel/index.js';

/**
 * The value basis of an approval rule (access-and-approvals 8, 9.2; PRD-ACS-015; DM-8, DEC-105): none, as for an
 * access change or an offer, which has no value limit; or a money basis: cost, as for the stock actions of
 * domain-model section 5, bill value, documented valuation, the amount paid, a day-close cash difference or the
 * period's net pay. A request on a money basis is decided only within a limit (9.2, 9.3).
 */
export type ValueBasis = 'none' | MoneyBasis;

/**
 * The fixed parts of one approval rule, kept in code (access-and-approvals 8; domain-model section 5): the module that
 * owns the document, the record type whose approve permission decides it (9.3), whether independent approval is
 * required, which can never be switched off (PRD-ACS-006, POL-02.07), its value basis (PRD-ACS-015), and whether its
 * decision gives a free-text reason, which only a reason-list change does (DEC-104), and the restricted field classes
 * the evidence of its decision carries (9.5; imports-and-opening-data 11; S1-F08-T03). A synthetic rule is declared by
 * test code only and accepted only in a test composition (stock-ledger 15.3; DEC-112, H4).
 */
export interface ApprovalRule {
  readonly actionType: string;
  readonly module: string;
  /** The record type approve is granted on, and the type of the document's record (4.1). */
  readonly recordType: string;
  readonly independent: true;
  readonly value: ValueBasis;
  readonly freeTextReason: boolean;
  /**
   * The restricted field classes a decision's evidence files carry, which a reader of them needs besides view on the
   * record type (imports-and-opening-data 11). Declared for every rule, so none is left out by a default.
   */
  readonly decisionEvidenceClasses: readonly FieldClass[];
  readonly synthetic: boolean;
}

function rule(
  actionType: AccessActionType,
  recordType: string,
  freeTextReason = false,
  decisionEvidenceClasses: readonly FieldClass[] = [],
): ApprovalRule {
  return {
    actionType,
    module: 'access',
    recordType,
    independent: true,
    value: 'none',
    freeTextReason,
    decisionEvidenceClasses,
    synthetic: false,
  };
}

/**
 * The approval rules of access changes (access-and-approvals 9.11; POL-02.06, POL-02.07; DEC-112). A material change
 * to any of these documents is a new version (9.6): no change to an access change carries a decision forward.
 */
export const accessApprovalRules: ReadonlyMap<string, ApprovalRule> = new Map(
  [
    // A user change's evidence, a new user or a change to one, may be a photograph of an identity document, so it
    // carries identity-documents; every other access change's carries none (9.5; RR-453, product owner 9 Oct 2026;
    // the KDPS Admin confirms before live use). A credential reset takes no approval, so it has no decision evidence.
    rule('access.user.change', 'access.user', false, ['identity-documents']),
    rule('access.role.change', 'access.role'),
    rule('access.role_assignment.change', 'access.role_assignment'),
    rule('access.role_assignment.withdrawal', 'access.role_assignment'),
    rule('access.approval_reason.change', 'access.approval_reason', true),
    rule('access.approval_rule_setting.change', 'access.approval_rule_setting'),
    // The essential security settings (3.3; POL-02.06, POL-02.07; DEC-118, RR-334).
    rule('access.setting.change', 'access.setting'),
    // Approval limits (9.2; POL-02.07, POL-02.09, POL-02.15; S1-F05-T01).
    rule('access.approval_limit.change', 'access.approval_limit'),
    // Stand-in grants (10; PRD-ACS-018, POL-02.20; GC3-7, DEC-105; S1-F05-T02).
    rule('access.stand_in_grant.change', 'access.stand_in_grant'),
  ].map((each) => [each.actionType, each]),
);

/**
 * The approval rules a module declares for its documents, and, for a master change, the effect of a decision on the
 * document (access-and-approvals 8, 9.8b; module-map 6.2 flow A, section 3 rule 6): `access` defines this contract
 * and the owning module implements it, so Decide makes the decided version take effect in its own transaction
 * without `access` depending on the owner. A rule with no effect is a document the owner posts in its own command
 * (9.8a). The composition root hands every module's declarations to `access` at start.
 */
export interface ModuleApprovals {
  readonly rules: readonly ApprovalRule[];
  /** The effect of a decision, by action type; each names a rule of `rules`. */
  readonly effects: ReadonlyMap<string, DocumentEffect>;
}

/**
 * What a decision does to a module's document version (module-map 6.2 flow A step 3): the rows Decide locks with the
 * request at step 1 (code-house-rules 8.2), and the version taking effect or being rejected, with its own rechecks
 * under those locks, its audit record and its outbox rows. Approve may still refuse, and then nothing of the
 * decision is written; reject never refuses.
 */
export interface DocumentEffect {
  targets(context: TransactionContext, versionId: string): Promise<LockTarget[]>;
  /**
   * The action types of the other documents the decision decides with this one, such as a new business unit's first
   * mapping (structure-and-masters 3.4; product owner, 8 Oct 2026). The decider needs approve on each one's record
   * type too, each through an assignment of its own or the same one (access-and-approvals 9.3).
   */
  decidesWith?(context: TransactionContext, versionId: string): Promise<readonly string[]>;
  approve(context: TransactionContext, decider: EffectDecider, versionId: string): Promise<EffectOutcome>;
  reject(context: TransactionContext, decider: EffectDecider, versionId: string): Promise<EffectOutcome>;
}

/** The approver making a decision take effect, the assignment relied on and the decision (access-and-approvals 9.5). */
export interface EffectDecider {
  readonly actor: { readonly kind: 'user'; readonly id: string };
  readonly roleAssignmentId?: string;
  readonly approvalDecisionId?: string;
  /** The words of the reason given, for the audit records of the effect (numbering-and-audit 4.2). */
  readonly reason?: string;
}

export type EffectOutcome =
  | { readonly kind: 'success'; readonly answer: unknown }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** The prefix every synthetic action type carries (stock-ledger 15.3; code-house-rules 11.1). */
const SYNTHETIC_PREFIX = 'test-';

/**
 * Every approval rule the composition knows: access's own, and the rules other modules declare for their documents
 * (access-and-approvals 8, 9.1; module-map 4.3 "Request approval"). Checked once, at start, so a wrong rule fails the
 * start (code-house-rules 12.14):
 *
 * - a module rule never takes an access action type or the `access` module;
 * - a synthetic rule is accepted only in a test composition, and its action type begins `test-`; a rule that is not
 *   synthetic never does (stock-ledger 13.2, 15.3; DEC-112, H2 and H4);
 * - its record type is declared, with approve (4.1). A record type that declares scope facts is a rule like any
 *   other: the request keeps the document's facts and eligibility matches them (9.1, 9.3; RR-435, S1-F02-T03).
 */
export function approvalRulesOf(
  moduleRules: readonly ApprovalRule[],
  composition: Composition,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
): ReadonlyMap<string, ApprovalRule> {
  const rules = new Map(accessApprovalRules);
  for (const each of moduleRules) {
    if (rules.has(each.actionType) || each.module === 'access') {
      throw new Error(`Approval rule ${each.actionType} takes an access action type or module`);
    }
    if (each.synthetic !== each.actionType.startsWith(SYNTHETIC_PREFIX)) {
      throw new Error(
        `Approval rule ${each.actionType}: only a synthetic rule's action type begins ${SYNTHETIC_PREFIX}`,
      );
    }
    if (each.synthetic && composition.kind !== 'test') {
      throw new Error(`Synthetic approval rule ${each.actionType} outside a test composition`);
    }
    const declaration = registry.get(each.recordType);
    if (declaration?.actions.includes('approve') !== true) {
      throw new Error(`Approval rule ${each.actionType}: record type ${each.recordType} takes no approve`);
    }
    rules.set(each.actionType, each);
  }
  return rules;
}

/** Checks, at start, that every effect names a module's rule (code-house-rules 12.14). */
export function effectsOf(
  effects: ReadonlyMap<string, DocumentEffect>,
  rules: ReadonlyMap<string, ApprovalRule>,
): ReadonlyMap<string, DocumentEffect> {
  for (const actionType of effects.keys()) {
    const rule = rules.get(actionType);
    if (rule === undefined || rule.module === 'access') {
      throw new Error(`Decision effect ${actionType} names no module's approval rule`);
    }
  }
  return effects;
}
