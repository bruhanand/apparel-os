import type { TransactionContext } from '../../../src/kernel/index.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from '../../support/transactions.js';
import type { SendOptions, StepSent } from './harness.js';
import type { Pending, ScenarioRun } from './scenario.js';

// Steps of the stock harness driven one against another on separate connections, ordered by what PostgreSQL reports,
// never by a sleep (code-house-rules 10.3; stock-ledger 11.9; S1-F10-T07). Every value is SYNTHETIC.

/** A step kept under all its locks, after its rechecks and before any write, until the test lets it go on. */
export interface HeldStep {
  /** The backend of its transaction. */
  readonly pid: number;
  /** Lets it write and commit; answers what it came to. */
  release(): Promise<StepSent>;
}

/** Sends a prepared step and keeps it under its locks (13.1 "Recheck and value") until released. */
export async function holdStep(run: ScenarioRun, pending: Pending, options: SendOptions = {}): Promise<HeldStep> {
  const reached = gate();
  const release = gate();
  let pid = 0;
  const sent = run.send(pending, {
    ...options,
    hold: async (context: TransactionContext) => {
      pid = await backendPid(context);
      reached.open();
      await release.wait;
    },
  });
  // A step refused before it reached the hold opens nothing: answer it at once.
  const early = sent.then((answer) => {
    reached.open();
    return answer;
  });
  await reached.wait;
  return {
    pid,
    release: async () => {
      release.open();
      return early;
    },
  };
}

/** Sends a step that must wait for a lock the held one has, and answers once PostgreSQL shows it waiting. */
export async function sendBehind(
  run: ScenarioRun,
  held: HeldStep,
  pending: Pending,
  options: SendOptions = {},
): Promise<{ readonly pid: number; readonly sent: Promise<StepSent> }> {
  const sent = run.send(pending, options);
  const pid = await waitUntilAnyWaitingForLock(run.harness.database, [held.pid]);
  return { pid, sent };
}
