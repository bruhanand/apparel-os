import {
  ACCOUNT_TYPE,
  BOOK_SETTING_TYPE,
  POSTING_MAP_TYPE,
  type FinanceChanged,
  type PolicyNumber,
} from '@apparel-os/schemas';
import { Audit } from '../../src/modules/audit/index.js';
import { Configuration, type ValidityCheck } from '../../src/modules/configuration/index.js';
import { JOURNAL_KIND, postingConfigurationCheck } from '../../src/modules/finance/books/index.js';
import { policyEvidence } from '../../src/modules/files-imports/index.js';
import { PT_APPROVAL_CAPABILITY, PT_OPERATIONS } from '../../src/modules/merchandise/pt/domain/gate.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { syntheticPolicyValues } from './booking.js';
import { TEST_COMPOSITION } from './composition.js';
import { SYNTHETIC_POLICY_17_VALUES } from './damage.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import { decided, type StructureSetup } from './organisation.js';
import { RECEIVING_POLICY_CHECKS } from './receiving.js';
import { writeSyntheticStoredFile } from './tax-rules.js';

// What a PT's approval needs beside the receiving world (goods-in 6.3, 10.5; books-and-posting 2.2, 3.1, 4.1, 6.1;
// S2-F06-T01), shared by the integration tests' world (support/pt-approval.ts) and the server of the browser journeys
// (test/browser/serve.ts): the book of the GRN's unit with a SYNTHETIC cost setting, chart, posting map of
// `stock.cost-established` to a SYNTHETIC receipt account (DEC-140) and of its reversal (S2-F09-T01), period and
// journal series, each approved by a
// different person with SYNTHETIC CA evidence; and the PT approval gate open under the policies it needs, on the one
// value of a TEST-ONLY check each where no module reports the policy's values (RR-561, RR-565, RR-605). Made through
// the real commands where a person would make them (code-house-rules 11.2). Every account, amount, date and number is
// SYNTHETIC; none is a KDPS value.

/** The TEST-ONLY checks the application under test registers beside its own (goods-in 10.5). */
export const PT_TEST_CHECKS: readonly ValidityCheck[] = [
  SYNTHETIC_POLICY_17_VALUES,
  syntheticPolicyValues(1),
  syntheticPolicyValues(3),
];

/**
 * The SYNTHETIC accounts of the book: stock value, goods in transit, the receipt account set by Accounts and the CA
 * (DEC-140), and the variance a reversal of an inflow made in error may leave (stock-ledger 7.5; books-and-posting 7.1).
 */
export type SyntheticAccount = 'INV' | 'TRN' | 'RCPT' | 'VAR';

/** The book as a PT's approval posts into it. */
export interface SyntheticPtBook {
  readonly accounts: Readonly<Record<SyntheticAccount, string>>;
  readonly periodId: string;
}

function ok<A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { readonly code: string } }): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/**
 * The book configured for a PT's approval: a SYNTHETIC moving-average cost setting with one pool for the book, the
 * four SYNTHETIC accounts, the map of `stock.cost-established` (to the pool, and to a dispatch for goods in transit,
 * stock-ledger 7.6) against the receipt account, and the map of its reversal, a period from five days before the
 * setup's today to sixty after, and a journal series with a SYNTHETIC format. The setup's books must declare the stock
 * ledger's posting event kinds.
 */
export async function syntheticPtBook(setup: StructureSetup, label: string, bookId: string): Promise<SyntheticPtBook> {
  const inForce = async (
    change: FinanceChanged,
    recordType: typeof ACCOUNT_TYPE | typeof BOOK_SETTING_TYPE | typeof POSTING_MAP_TYPE,
  ) => {
    ok(
      await setup.asPreparerDo((c, p) =>
        setup.books.recordCaEvidence(c, p, {
          versions: [{ recordType, versionId: change.versionId }],
          evidence: {
            kind: 'reference',
            what: syntheticName('CA approval letter'),
            givenBy: syntheticName('CA'),
            givenOn: setup.today(),
            keptAt: syntheticName('Accounts file'),
          },
        }),
      ),
    );
    decided(await setup.decide(change.requestId ?? '', change.versionId));
  };
  const cost = ok(
    await setup.asPreparerDo((c, p) =>
      setup.books.prepareBookSetting(c, p, bookId, {
        kind: 'cost',
        formula: 'moving-average',
        poolMode: 'book',
        origin: 'synthetic',
        validFrom: setup.today(),
      }),
    ),
  );
  await inForce(cost, BOOK_SETTING_TYPE);
  const accounts = { INV: '', TRN: '', RCPT: '', VAR: '' } as Record<SyntheticAccount, string>;
  for (const [account, nature] of [
    ['INV', 'asset'],
    ['TRN', 'asset'],
    ['RCPT', 'liability'],
    ['VAR', 'expense'],
  ] as const) {
    const change = ok(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareAccount(c, p, {
          bookId,
          code: syntheticCode(`${label}-${account}`),
          nature,
          origin: 'synthetic',
          name: syntheticName(`Account ${account}`),
          validFrom: setup.today(),
        }),
      ),
    );
    await inForce(change, ACCOUNT_TYPE);
    accounts[account] = change.recordId;
  }
  const map = ok(
    await setup.asPreparerDo((c, p) =>
      setup.books.preparePostingMap(c, p, {
        bookId,
        eventKind: 'stock.cost-established',
        origin: 'synthetic',
        validFrom: setup.today(),
        lines: [
          { component: 'to-pool', side: 'debit', accountId: accounts.INV, requiresStore: false, requiresBrand: false },
          {
            component: 'to-pool',
            side: 'credit',
            accountId: accounts.RCPT,
            requiresStore: false,
            requiresBrand: false,
          },
          // Goods in transit between pools take their value onto the dispatch (stock-ledger 7.6).
          {
            component: 'to-dispatch',
            side: 'debit',
            accountId: accounts.TRN,
            requiresStore: false,
            requiresBrand: false,
          },
          {
            component: 'to-dispatch',
            side: 'credit',
            accountId: accounts.RCPT,
            requiresStore: false,
            requiresBrand: false,
          },
        ],
      }),
    ),
  );
  await inForce(map, POSTING_MAP_TYPE);
  // The reversal of a cost established, as a PT's reversal before the scan-in posts it (goods-in 6.7; stock-ledger
  // 7.5, 13.21; S2-F09-T01): the lines of the cost established on the other sides, and the variance of a part that would
  // take the pool below zero to the SYNTHETIC variance account, as golden P2's maps do (books-and-posting 16.1).
  const line = (component: string, side: 'debit' | 'credit', accountId: string) => ({
    component,
    side,
    accountId,
    requiresStore: false,
    requiresBrand: false,
  });
  const reversalMap = ok(
    await setup.asPreparerDo((c, p) =>
      setup.books.preparePostingMap(c, p, {
        bookId,
        eventKind: 'stock.cost-established-reversal',
        origin: 'synthetic',
        validFrom: setup.today(),
        lines: [
          line('to-pool', 'debit', accounts.RCPT),
          line('to-pool', 'credit', accounts.INV),
          line('to-dispatch', 'debit', accounts.RCPT),
          line('to-dispatch', 'credit', accounts.TRN),
          line('variance', 'debit', accounts.RCPT),
          line('variance', 'credit', accounts.VAR),
        ],
      }),
    ),
  );
  await inForce(reversalMap, POSTING_MAP_TYPE);
  const financialYear = syntheticCode(`${label}-FY`);
  const period = ok(
    await setup.asPreparerDo((c, p) =>
      setup.books.definePeriod(c, p, bookId, {
        code: syntheticCode(`${label}-P1`),
        financialYear,
        firstDay: setup.day(-5),
        lastDay: setup.day(60),
      }),
    ),
  );
  const journalFormat = syntheticCode(`${label}-JV`);
  await setup.run(setup.preparer.id, (c) =>
    setup.numbering.defineFormatVersion(c, journalFormat, [
      { kind: 'text', text: 'SYN-JV-' },
      { kind: 'sequence', width: 5 },
    ]),
  );
  const journals = await setup.run(setup.preparer.id, (c) =>
    setup.numbering.defineSeries(c, {
      kind: JOURNAL_KIND.kind,
      scopeKey: bookId,
      financialYear,
      displayScopeKey: bookId,
      formatCode: journalFormat,
    }),
  );
  if (journals.kind !== 'done') throw new Error(`Journal series refused: ${journals.refusal.code}`);
  return { accounts, periodId: period.periodId };
}

/** The three policies PT approval needs besides 10, which receiving's gate opens (goods-in 10.5). */
export const PT_POLICIES: readonly PolicyNumber[] = [1, 3, 9];

/**
 * The PT approval gate open Organisation-wide (goods-in 10.5; module-map 4.4; DM-6), through configuration's commands as
 * labelled synthetic status (code-house-rules 12.14): the setup's preparer records the policies given Signed, by
 * default 1, 3 and 9, leaving out any another gate signed already (the booking gate signs policy 1); the approver, who
 * entered none of their values, validates them, each with a SYNTHETIC stored file as evidence; the preparer switches
 * the PT approval capability on. The values validated are the book's posting configuration (policy 9) and the
 * TEST-ONLY checks' (policies 1 and 3), so every book's configuration is made before.
 */
export async function ptGateOpen(
  setup: StructureSetup,
  database: string,
  policies: readonly PolicyNumber[] = PT_POLICIES,
): Promise<void> {
  const audit = new Audit(capturingLogger().logger);
  const configuration = new Configuration({ audit, environment: { name: 'local' }, evidence: policyEvidence(audit) });
  for (const check of [postingConfigurationCheck, ...RECEIVING_POLICY_CHECKS]) configuration.registerCheck(check);
  for (const check of PT_TEST_CHECKS) configuration.registerCheck(check, TEST_COMPOSITION);
  for (const operation of PT_OPERATIONS) configuration.registerOperation(operation);
  const signer = setup.preparer;
  const validator = setup.approver;
  const signing = await grantSynthetic(database, { kind: 'user', id: signer.id }, [
    { recordType: 'configuration.policy_status', action: 'create' },
    { recordType: 'configuration.capability', action: 'edit' },
  ]);
  const validating = await grantSynthetic(database, { kind: 'user', id: validator.id }, [
    { recordType: 'configuration.policy_validation', action: 'create' },
  ]);
  for (const policy of policies) {
    const signatureEvidence = await writeSyntheticStoredFile(database, signer.id);
    ok(
      await setup.run(signer.id, (context) =>
        configuration.recordSignature(context, { userId: signer.id, roleAssignmentId: signing.assignmentId }, policy, {
          signatory: syntheticName(`policy ${String(policy)} signatory`),
          signedOn: setup.today(),
          origin: 'synthetic',
          evidence: [signatureEvidence],
        }),
      ),
    );
    const validationEvidence = await writeSyntheticStoredFile(database, validator.id);
    ok(
      await setup.run(validator.id, (context) =>
        configuration.recordValidation(
          context,
          { userId: validator.id, roleAssignmentId: validating.assignmentId },
          policy,
          { origin: 'synthetic', evidence: [validationEvidence] },
        ),
      ),
    );
  }
  ok(
    await setup.run(signer.id, (context) =>
      configuration.switchCapability(
        context,
        { userId: signer.id, roleAssignmentId: signing.assignmentId },
        PT_APPROVAL_CAPABILITY,
        true,
      ),
    ),
  );
}
