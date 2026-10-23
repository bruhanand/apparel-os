import { CommandDefect } from '../command-runner/command-errors.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';

// The read-model gateway (module-map 4.1 "Read-model gateway", section 3 rule 5; PRD-MOD-003, PRD-PRF-004,
// PRD-SEC-005; S2-F11-T01). A module declares each read model it offers others, by a name of its own, and serves it at
// start: the composition root hands the gateway every served read model, as it hands the ledger its callers
// (module-map section 3, rule 6). A reader, such as `reports`, names a read model by the declaration its owner exports
// and reads it only here, in the reader's own transaction under the reader's own actor, so row-level security and the
// reader's authorisation apply as to any read; the gateway answers it with the time it was read, the transaction's
// start (code-house-rules 8.1, 12.1 "Reads"). It holds no rule of any module and reads nothing itself. **Design
// choice.**

declare const readModelTypes: unique symbol;

/**
 * A declared read model: its name, `<module>.<read model>`, and the shapes of its query and answer, which the owner
 * fixes. Only the name exists at run time.
 */
export interface ReadModel<Query, Answer> {
  readonly name: string;
  readonly [readModelTypes]?: { readonly query: Query; readonly answer: Answer };
}

/** Declares a read model by its name (module-map section 3, rule 5). */
export function declareReadModel<Query, Answer>(name: string): ReadModel<Query, Answer> {
  return Object.freeze({ name });
}

/** How a read model's owner answers it, in the reader's transaction. */
export type ReadModelReader<Query, Answer> = (context: TransactionContext, query: Query) => Promise<Answer>;

/** A read model with the owner's reader, as the owner hands it to the composition root. */
export interface ServedReadModel {
  readonly name: string;
  readonly read: ReadModelReader<never, unknown>;
}

/** A read model served by its owner's reader. */
export function serveReadModel<Query, Answer>(
  model: ReadModel<Query, Answer>,
  read: ReadModelReader<Query, Answer>,
): ServedReadModel {
  return { name: model.name, read };
}

/** What the gateway answers: the read model's answer and when it was read (PRD-MOD-003, PRD-PRF-004). */
export interface ReadModelAnswer<Answer> {
  /** The time the reader's transaction started, an ISO 8601 instant in UTC (code-house-rules 9). */
  readonly asOf: string;
  readonly answer: Answer;
}

/** The token of the gateway. Inject it with @Inject(READ_MODEL_GATEWAY). */
export const READ_MODEL_GATEWAY = 'kernel.ReadModelGateway';

export class ReadModelGateway {
  private readonly served: ReadonlyMap<string, ReadModelReader<never, unknown>>;

  /** Every served read model, fixed once the application has started; one name served twice fails the start. */
  constructor(served: readonly ServedReadModel[]) {
    const byName = new Map<string, ReadModelReader<never, unknown>>();
    for (const each of served) {
      if (byName.has(each.name)) throw new Error(`The read model ${each.name} is served twice`);
      byName.set(each.name, each.read);
    }
    this.served = byName;
  }

  /**
   * Reads a declared read model in the reader's transaction, under the reader's own actor (PRD-SEC-005): a read with
   * no actor, or of a read model no module serves, is a defect.
   */
  async read<Query, Answer>(
    context: TransactionContext,
    model: ReadModel<Query, Answer>,
    query: Query,
  ): Promise<ReadModelAnswer<Answer>> {
    if (context.actor.kind !== 'actor') throw new CommandDefect(`The read model ${model.name} read with no actor`);
    const reader = this.served.get(model.name) as ReadModelReader<Query, Answer> | undefined;
    if (reader === undefined) throw new CommandDefect(`No module serves the read model ${model.name}`);
    return { asOf: context.startedAt.toISOString(), answer: await reader(context, query) };
  }
}
