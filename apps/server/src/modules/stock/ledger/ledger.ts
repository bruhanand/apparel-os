import type { CommandRefusal, Composition, TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../audit/index.js';
import { refusalOf, StockRefused, type LedgerRequest } from './domain/request.js';
import { lockPlan, type ExtraTargets, type LockedPlan } from './lock.js';
import { planRequest, type LedgerPlan } from './plan.js';
import type { LedgerPlaces, LedgerSkus } from './ports.js';
import { recheckPlan, type CheckedRequest } from './recheck.js';
import { CallerRegistry, type CallerRegistration } from './registry.js';
import { writeRequest, type Written } from './write.js';

// The ledger's interface for the unvalued operations (stock-ledger 13.1 to 13.5; S1-F10-T02): one request in four
// operations, Plan, Lock, Recheck and value and Write, inside the caller's command, which it joins and never opens or
// commits (code-house-rules 8.1; module-map section 3, rule 3). Each operation is its own file: plan.ts, lock.ts,
// recheck.ts and write.ts. The valued items and the call to Post arrive with S1-F10-T03.

export type { CheckedRequest, ExtraTargets, LedgerPlan, LockedPlan, Written };

/** An operation's answer: its value, or the refusal of 13.8. */
export type LedgerResult<Value> =
  { readonly kind: 'done'; readonly value: Value } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

export interface StockLedgerDependencies {
  readonly audit: AuditInterface;
  readonly places: LedgerPlaces;
  readonly skus: LedgerSkus;
  readonly registrations: readonly CallerRegistration[];
  /** How the application was composed; a synthetic caller needs a test composition (13.2). */
  readonly composition: Composition;
}

/** The ledger's interface (stock-ledger 13.1; module-map 4.13). Each operation takes the command's context first. */
export interface StockLedgerInterface {
  plan(context: TransactionContext, request: LedgerRequest): Promise<LedgerResult<LedgerPlan>>;
  lock(context: TransactionContext, plan: LedgerPlan, extra?: ExtraTargets): Promise<LockedPlan>;
  recheck(context: TransactionContext, locked: LockedPlan): Promise<LedgerResult<CheckedRequest>>;
  write(context: TransactionContext, checked: CheckedRequest, source?: AuditSource): Promise<Written>;
}

async function answer<Value>(work: () => Promise<Value>): Promise<LedgerResult<Value>> {
  try {
    return { kind: 'done', value: await work() };
  } catch (error) {
    if (error instanceof StockRefused) return { kind: 'refused', refusal: error.refusal };
    throw error;
  }
}

export class StockLedger implements StockLedgerInterface {
  private readonly registry: CallerRegistry;

  constructor(private readonly dependencies: StockLedgerDependencies) {
    this.registry = new CallerRegistry(dependencies.registrations, dependencies.composition);
  }

  /**
   * Plan (13.1): checks the caller's registration (13.2) and each item's shape; reads the places and SKUs as of the
   * business date (stand-ins until S1-F02 and S1-F03); finds what the items touch. Writes nothing and locks nothing.
   */
  async plan(context: TransactionContext, request: LedgerRequest): Promise<LedgerResult<LedgerPlan>> {
    const registered = this.registry.check(request.source, request.items);
    if (registered !== undefined) return { kind: 'refused', refusal: registered };
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: refusalOf('business-date-not-set', undefined) };
    if (request.items.length === 0) return { kind: 'refused', refusal: refusalOf('invalid-item', undefined) };
    return answer(() => planRequest(context, this.dependencies, request, date.date));
  }

  /** Lock (13.1; 10.3 steps 2 to 6). */
  lock(context: TransactionContext, plan: LedgerPlan, extra: ExtraTargets = {}): Promise<LockedPlan> {
    return lockPlan(context, plan, extra);
  }

  /**
   * Recheck and value (13.1; 10.4): a count freeze over the goods (8.1), available quantity, where each piece is,
   * holds, reservations, coverage and acceptance (6.2, 6.3), and what the actor cannot see (DEC-117). Answers each
   * item's value on its approval basis: Unknown for goods, none for a release; the request's is Unknown when any item's
   * is (PRD-ACS-016).
   */
  recheck(context: TransactionContext, locked: LockedPlan): Promise<LedgerResult<CheckedRequest>> {
    return answer(() => recheckPlan(context, locked));
  }

  /**
   * Write (13.1): the request's records, set-based in the order of their keys; one audit record naming them; the
   * events of 13.7 (PRD-INT-004, PRD-MOD-006). Movements carry the approval use the caller recorded first (13.3;
   * DEC-097). A constraint refusing a row here is a defect (10.4).
   */
  write(context: TransactionContext, checked: CheckedRequest, source?: AuditSource): Promise<Written> {
    return writeRequest(context, this.dependencies.audit, checked, source);
  }
}
