import { AsyncLocalStorage } from 'node:async_hooks';
import { CommandDefect } from './command-errors.js';

/**
 * The mark the command runner sets on the work it runs, so that code can tell it is inside a database transaction
 * (code-house-rules 8.3). It follows the work across every await of the command, and nothing else.
 */
interface CommandMark {
  readonly commandName: string;
}

const mark = new AsyncLocalStorage<CommandMark>();

/** Runs work under the mark of a command. Used only by the command runner. */
export function runMarked<T>(commandName: string, work: () => Promise<T>): Promise<T> {
  return mark.run({ commandName }, work);
}

/** Whether the caller is running inside a command's transaction. */
export function isInsideCommand(): boolean {
  return mark.getStore() !== undefined;
}

/**
 * Every adapter for an outside system calls this before it calls out: file storage, messaging, GST, bank, Tally, AI
 * or any other network service. Inside a transaction it refuses, so such work runs before the transaction or after
 * the commit through the outbox (code-house-rules 8.3; PRD-INT-006).
 */
export function refuseInsideCommand(outsideSystem: string): void {
  const current = mark.getStore();
  if (current !== undefined) {
    throw new CommandDefect(
      `${outsideSystem} was called inside the transaction of command ${current.commandName}; an outside system is called only before the transaction or after the commit (code-house-rules 8.3)`,
    );
  }
}
