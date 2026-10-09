import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../src/kernel/index.js';
import {
  EXCEPTION_CODE_KIND,
  EXCEPTION_CODE_SCOPE_KEY,
  type ExceptionTypeRegistration,
} from '../../src/modules/exceptions/index.js';
import type { FormatPart, NumberingInterface } from '../../src/modules/numbering/index.js';
import { syntheticCode, syntheticIdentifier } from '../fixtures/synthetic.js';
import { connect } from './postgres.js';

// S1-F08-T02: the test-only raising module of the exception tests and the browser journey (code-house-rules 11.4, as
// built): its documents live in `test_exceptions.document`, made by the test as the migration role in its own
// database copies, and it registers one SYNTHETIC exception type whose resolution check reads them. Every value here
// is SYNTHETIC: no format, owner, due time or escalation has a default (numbering-and-audit 3.5; V-03).

/** The test-only module. */
export const TEST_EXCEPTIONS_MODULE = syntheticIdentifier('exceptions');
/** Its record type, which its exceptions link to. */
export const TEST_DOCUMENT_TYPE = 'test_exceptions.document';

export const TEST_EXCEPTIONS_SCHEMA = `
  create schema test_exceptions;
  grant usage on schema test_exceptions to aos_runtime;
  create table test_exceptions.document (id uuid primary key, resolved boolean not null);
  grant select, insert, update on test_exceptions.document to aos_runtime;
`;

/** Makes the test-only schema in an Organisation database, as the migration role. */
export async function createTestExceptionsSchema(database: string): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query(TEST_EXCEPTIONS_SCHEMA);
  } finally {
    await owner.end();
  }
}

/**
 * The SYNTHETIC type: a mismatch on a test document. Its resolution check verifies that every linked document is
 * marked resolved, as an owning module verifies its correction (access-and-approvals 12.3; PRD-EXC-002).
 */
export const syntheticMismatch: ExceptionTypeRegistration = {
  code: `${TEST_EXCEPTIONS_MODULE}.mismatch`,
  category: 'mismatch',
  module: TEST_EXCEPTIONS_MODULE,
  linksTo: [TEST_DOCUMENT_TYPE],
  resolutionCheck: async (context, subject) => {
    const missing = [];
    for (const link of subject.links) {
      const rows = await context.tx.execute<{ resolved: boolean }>(
        sql`select resolved from test_exceptions.document where id = ${link.recordId}::uuid`,
      );
      if (rows.rows[0]?.resolved !== true)
        missing.push({ kind: 'test-document-unresolved', documentId: link.recordId });
    }
    return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
  },
};

/** Writes a test document in the command's transaction. */
export async function writeTestDocument(context: TransactionContext, resolved = false): Promise<string> {
  const id = uuidv7();
  await context.tx.execute(sql`insert into test_exceptions.document (id, resolved) values (${id}::uuid, ${resolved})`);
  return id;
}

/** A SYNTHETIC exception-code format (numbering-and-audit 3.5: no format has a default). */
export const SYNTHETIC_EXCEPTION_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN-EX-' },
  { kind: 'sequence', width: 5 },
];

/** Defines the SYNTHETIC format and an Open exception-code series, in the command's transaction. */
export async function defineSyntheticCodeSeries(context: TransactionContext, numbering: NumberingInterface) {
  const code = syntheticCode('EXCEPTION-CODE');
  const format = await numbering.defineFormatVersion(context, code, SYNTHETIC_EXCEPTION_FORMAT);
  if (format.kind !== 'done') throw new Error(`The synthetic format was refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    kind: EXCEPTION_CODE_KIND.kind,
    scopeKey: EXCEPTION_CODE_SCOPE_KEY,
    displayScopeKey: EXCEPTION_CODE_SCOPE_KEY,
    formatCode: code,
  });
  if (series.kind !== 'done') throw new Error(`The synthetic series was refused: ${series.refusal.code}`);
  return series.value;
}
