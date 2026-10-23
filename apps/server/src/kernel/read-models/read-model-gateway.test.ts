import { describe, expect, it } from 'vitest';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { CommandDefect } from '../command-runner/command-errors.js';
import { declareReadModel, ReadModelGateway, serveReadModel } from './read-model-gateway.js';

// S2-F11-T01: the kernel's read-model gateway (module-map 4.1 "Read-model gateway", section 3 rule 5; PRD-MOD-003,
// PRD-PRF-004). A module declares a read model and serves it at start; a reader reads it only through the gateway, under
// its own actor, and every answer carries the time it was read. The contexts here are SYNTHETIC stand-ins: no database
// is read.

const STARTED = new Date('2026-10-23T05:30:00.000Z');

function contextAs(actor: TransactionContext['actor']): TransactionContext {
  return { actor, startedAt: STARTED, readOnly: true } as unknown as TransactionContext;
}

const reader = contextAs({ kind: 'actor', actorId: '01900000-0000-7000-8000-000000000001' });

const SYN_COUNT = declareReadModel<{ readonly of: string }, { readonly count: number }>('syn.count');

describe('the read-model gateway (module-map 4.1, section 3 rule 5)', () => {
  it('PRD-MOD-003 PRD-PRF-004 serves a declared read model with the time it was read', async () => {
    const gateway = new ReadModelGateway([
      serveReadModel(SYN_COUNT, (_context, query) => Promise.resolve({ count: query.of.length })),
    ]);
    await expect(gateway.read(reader, SYN_COUNT, { of: 'SYN' })).resolves.toEqual({
      asOf: '2026-10-23T05:30:00.000Z',
      answer: { count: 3 },
    });
  });

  it('PRD-MOD-003 refuses to start with one read model served twice', () => {
    const serve = () => serveReadModel(SYN_COUNT, () => Promise.resolve({ count: 0 }));
    expect(() => new ReadModelGateway([serve(), serve()])).toThrow(/syn\.count/);
  });

  it('PRD-MOD-003 a read model no module serves is a defect, never an empty answer', async () => {
    const gateway = new ReadModelGateway([]);
    await expect(gateway.read(reader, SYN_COUNT, { of: 'SYN' })).rejects.toBeInstanceOf(CommandDefect);
  });

  it('PRD-SEC-005 reads only under the reader’s own actor: a read with no actor is a defect', async () => {
    const gateway = new ReadModelGateway([serveReadModel(SYN_COUNT, () => Promise.resolve({ count: 0 }))]);
    await expect(
      gateway.read(contextAs({ kind: 'no-actor', path: 'authenticate' }), SYN_COUNT, { of: 'SYN' }),
    ).rejects.toBeInstanceOf(CommandDefect);
  });
});
