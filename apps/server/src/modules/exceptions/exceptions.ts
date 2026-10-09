import type { ExceptionParty, RoutingList, RoutingVersionDraft } from '@apparel-os/schemas';
import type { LatestRequest } from '../access/index.js';
import {
  JOB_RECORD_TYPE,
  jobState,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { InboxInterface } from '../inbox/index.js';
import type { NumberingInterface } from '../numbering/index.js';
import { routingInForce, today, type Outcome } from './commands/common.js';
import {
  close,
  comment,
  escalateOverdue,
  reassign,
  recordCorrection,
  reopen,
  type Acting,
  type Changed,
} from './commands/lifecycle.js';
import { codeSeriesTarget, raise, raiseInOwnCommand, type Raised, type RaiseInput } from './commands/raise.js';
import { listRouting, prepareRouting } from './commands/routing.js';
import { checkTypes, missingRouting, type ExceptionTypeRegistration } from './domain/types.js';
import { exceptionsById, openExceptions, readException } from './queries/read.js';

/**
 * The type `exceptions` registers itself: an unfinished operation, raised when a job still fails after its retries
 * (access-and-approvals 9.8 step 4; code-house-rules 12.9; PRD-EXC-001). It links to the failed job, and its
 * resolution check verifies that the job has since completed, as when an authorised operator runs it again under the
 * same rules (S1-F08-T04): the job keeps its identifier.
 */
export const unfinishedOperation: ExceptionTypeRegistration = {
  code: 'exceptions.unfinished-operation',
  category: 'unfinished-operation',
  module: 'exceptions',
  linksTo: [JOB_RECORD_TYPE],
  resolutionCheck: async (context, subject) => {
    const missing = [];
    for (const link of subject.links) {
      if (link.recordType !== JOB_RECORD_TYPE) continue;
      const state = await jobState(context, link.recordId);
      if (state !== 'completed')
        missing.push({ kind: 'job-not-completed', jobId: link.recordId, state: state ?? 'none' });
    }
    return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
  },
};

export interface ExceptionsDependencies {
  readonly numbering: NumberingInterface;
  readonly inbox: InboxInterface;
  readonly audit: AuditInterface;
  /** The types the raising modules register (12.1; module-map section 3, rule 6), beside its own. */
  readonly types: readonly ExceptionTypeRegistration[];
}

/**
 * The exceptions module's interface (module-map 4.13; access-and-approvals 12), as built by S1-F08-T02. Every operation
 * joins the caller's transaction through its context (code-house-rules 8.1). Who may act is the caller's to admit:
 * the owner, a holder of the owning role or an escalation recipient, or a person Authorise admits (12.4 "As built").
 */
export interface ExceptionsInterface {
  /** The registered types, its own included. */
  readonly types: ReadonlyMap<string, ExceptionTypeRegistration>;
  /**
   * The Available answers (7.1 step 2; S1-F04-T01 registers them): undefined when an Open exception-code series exists
   * and the type has routing in force at the Site today; otherwise the refusal naming the missing series, or the type
   * and Site (DEC-116, POL-02.16).
   */
  available(context: TransactionContext, typeCode: string, siteId: string | null): Promise<CommandRefusal | undefined>;
  /** The exception-code series as a lock target for the raising command's step 8, or the refusal naming it. */
  codeSeriesTarget(context: TransactionContext): Promise<Outcome<LockTarget>>;
  /** Raise, in a command that holds the exception-code series at step 8 (12.1). */
  raise(context: TransactionContext, input: RaiseInput): Promise<Outcome<Raised>>;
  /** Raise in a command of its own, as after a rollback, so it survives (module-map 4.13). */
  raiseInOwnCommand(context: TransactionContext, input: RaiseInput): Promise<Outcome<Raised>>;
  comment(context: TransactionContext, acting: Acting, exceptionId: string, text: string): Promise<Outcome<Changed>>;
  reassign(
    context: TransactionContext,
    acting: Acting,
    exceptionId: string,
    to: ExceptionParty,
  ): Promise<Outcome<Changed>>;
  /** The owning module records the correction: Resolved (12.3). */
  recordCorrection(context: TransactionContext, acting: Acting, exceptionId: string): Promise<Outcome<Changed>>;
  close(context: TransactionContext, acting: Acting, exceptionId: string): Promise<Outcome<Changed>>;
  reopen(context: TransactionContext, acting: Acting, exceptionId: string, text: string): Promise<Outcome<Changed>>;
  escalateOverdue(context: TransactionContext, acting: Acting): Promise<number>;
  prepareRouting(
    context: TransactionContext,
    preparer: { readonly userId: string; readonly roleAssignmentId: string },
    draft: RoutingVersionDraft,
  ): Promise<Outcome<{ routingId: string; versionId: string }>>;
  listRouting(
    context: TransactionContext,
    names: (parties: readonly ExceptionParty[]) => Promise<(string | null)[]>,
    requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
  ): Promise<Omit<RoutingList, 'asOf'>>;
  readException: typeof readException;
  openExceptions: typeof openExceptions;
  exceptionsById: typeof exceptionsById;
}

export class Exceptions implements ExceptionsInterface {
  readonly types: ReadonlyMap<string, ExceptionTypeRegistration>;

  constructor(private readonly dependencies: ExceptionsDependencies) {
    this.types = checkTypes([unfinishedOperation, ...dependencies.types]);
  }

  private get raising() {
    return { ...this.dependencies, types: this.types };
  }

  async available(context: TransactionContext, typeCode: string, siteId: string | null) {
    const series = await codeSeriesTarget(context, this.dependencies.numbering);
    if (series.kind === 'refused') return series.refusal;
    const date = await today(context);
    if (date.kind === 'refused') return date.refusal;
    if ((await routingInForce(context, typeCode, siteId, date.value)) === undefined) {
      return {
        kind: 'unavailable',
        code: 'exceptions.no-routing',
        missing: [missingRouting(typeCode, siteId)],
      } as const;
    }
    return undefined;
  }

  codeSeriesTarget(context: TransactionContext) {
    return codeSeriesTarget(context, this.dependencies.numbering);
  }

  raise(context: TransactionContext, input: RaiseInput) {
    return raise(context, this.raising, input);
  }

  raiseInOwnCommand(context: TransactionContext, input: RaiseInput) {
    return raiseInOwnCommand(context, this.raising, input);
  }

  comment(context: TransactionContext, acting: Acting, exceptionId: string, text: string) {
    return comment(context, this.raising, acting, exceptionId, text);
  }

  reassign(context: TransactionContext, acting: Acting, exceptionId: string, to: ExceptionParty) {
    return reassign(context, this.raising, acting, exceptionId, to);
  }

  recordCorrection(context: TransactionContext, acting: Acting, exceptionId: string) {
    return recordCorrection(context, this.raising, acting, exceptionId);
  }

  close(context: TransactionContext, acting: Acting, exceptionId: string) {
    return close(context, this.raising, acting, exceptionId);
  }

  reopen(context: TransactionContext, acting: Acting, exceptionId: string, text: string) {
    return reopen(context, this.raising, acting, exceptionId, text);
  }

  escalateOverdue(context: TransactionContext, acting: Acting) {
    return escalateOverdue(context, this.raising, acting);
  }

  prepareRouting(
    context: TransactionContext,
    preparer: { readonly userId: string; readonly roleAssignmentId: string },
    draft: RoutingVersionDraft,
  ) {
    return prepareRouting(context, this.dependencies.audit, this.types, preparer, draft);
  }

  listRouting(
    context: TransactionContext,
    names: (parties: readonly ExceptionParty[]) => Promise<(string | null)[]>,
    requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
  ) {
    return listRouting(context, this.types, names, requests);
  }

  readException = readException;
  openExceptions = openExceptions;
  exceptionsById = exceptionsById;
}
