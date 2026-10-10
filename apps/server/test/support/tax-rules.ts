import { createHash } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { TAX_RULE_TYPE, type PermissionAction } from '@apparel-os/schemas';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../../src/kernel/index.js';
import { Access, type DecisionOutcome, type Preparer } from '../../src/modules/access/index.js';
// The access module's own key reader, so the fresh-code check opens the synthetic factor secrets (11.2).
import { OrganisationKeys } from '../../src/modules/access/domain/organisation-keys.js';
import { Audit } from '../../src/modules/audit/index.js';
// The module's own class, composed here as the application composes it (code-house-rules 11.2).
import { FilesImports } from '../../src/modules/files-imports/files-imports.js';
import { TaxRules, taxRulesApprovals } from '../../src/modules/finance/tax-rules/index.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { codeFor, syntheticTimezone, writeSyntheticReason, writeSyntheticUser, type SyntheticUser } from './access.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import { localOrigins } from './origins.js';
import { connect, databaseUrl } from './postgres.js';

// The tax rules part through its real interfaces (code-house-rules 11.2; S1-F09-T04): `access` built with the approval
// rules and decision effects the part declares, as the application composes it, and SYNTHETIC Accounts users: a
// preparer (who may approve too, so a refusal of their own preparation is for the preparation alone), a different
// approver, and a reader outside Accounts, who holds view only. Decisions take a fresh authenticator code, so the
// clock of these commands moves 30 seconds before each (access-and-approvals 3.3). Every value here is SYNTHETIC.

export interface TaxRulesSetup {
  readonly access: Access;
  readonly taxRules: TaxRules;
  readonly preparer: SyntheticUser;
  readonly approver: SyntheticUser;
  readonly outsider: SyntheticUser;
  readonly asPreparer: Preparer;
  /** The approver as a recorder of the CA's evidence, through their own assignment. */
  readonly asApprover: Preparer;
  run<T>(actorId: string, work: (context: TransactionContext) => Promise<T>): Promise<T>;
  asPreparerDo<Answer>(work: (context: TransactionContext, preparer: Preparer) => Promise<Answer>): Promise<Answer>;
  asApproverDo<Answer>(work: (context: TransactionContext, recorder: Preparer) => Promise<Answer>): Promise<Answer>;
  decide(
    requestId: string,
    versionId: string,
    outcome?: 'approve' | 'reject',
    by?: SyntheticUser,
  ): Promise<DecisionOutcome>;
  today(): string;
  day(daysFromToday: number): string;
  advanceDays(days: number): void;
  close(): Promise<void>;
}

const DAY_MS = 86_400_000;

export async function taxRulesSetup(options: {
  readonly directory: string;
  readonly database: string;
  readonly organisationCode: string;
  readonly keysEnvironment: Record<string, string>;
  readonly label: string;
}): Promise<TaxRulesSetup> {
  const log = capturingLogger();
  const router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(options.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(options.organisationCode);
  if (!found.routed) throw new Error(`${options.organisationCode} is not routed`);
  const routed: RoutedOrganisation = found.organisation;
  const audit = new Audit(log.logger);
  const approvals = taxRulesApprovals(audit);
  const keys = OrganisationKeys.fromEnvironment(options.keysEnvironment);
  const access = new Access({
    origins: localOrigins,
    audit,
    keys,
    approvalRules: [...approvals.rules],
    documentEffects: new Map(approvals.effects),
    scopeMembers: [],
  });
  const taxRules = new TaxRules({ audit, access, files: new FilesImports(audit), origins: localOrigins });
  const write = (label: string) =>
    writeSyntheticUser(options.database, options.organisationCode, options.keysEnvironment, { label, enrolled: true });
  const preparer = await write(`${options.label}-PREPARER`);
  const approver = await write(`${options.label}-APPROVER`);
  const outsider = await write(`${options.label}-OUTSIDER`);
  const grants = (actions: readonly PermissionAction[]) =>
    actions.map((action) => ({ recordType: TAX_RULE_TYPE, action }));
  const prepared = await grantSynthetic(
    options.database,
    { kind: 'user', id: preparer.id },
    grants(['view', 'create', 'edit', 'approve']),
  );
  const approving = await grantSynthetic(
    options.database,
    { kind: 'user', id: approver.id },
    // The approver records the CA's evidence too, as the books part's is recorded (books-and-posting 6.3).
    [...grants(['view', 'approve']), { recordType: 'finance.ca_approval_evidence', action: 'create' }],
  );
  await grantSynthetic(options.database, { kind: 'user', id: outsider.id }, grants(['view']));
  const approveReason = await writeSyntheticReason(options.database, 'approve');
  const rejectReason = await writeSyntheticReason(options.database, 'reject');
  let offsetMs = 0;
  const now = () => new Date(Date.now() + offsetMs);
  const runner = new CommandRunner({ clock: { now }, timezones: syntheticTimezone, logger: log.logger });
  const run = <T>(actorId: string, work: (context: TransactionContext) => Promise<T>) =>
    runner.run(
      {
        commandName: 'finance.synthetic-test',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId },
      },
      work,
    );
  const asPreparer: Preparer = { userId: preparer.id, roleAssignmentId: prepared.assignmentId };
  const asApprover: Preparer = { userId: approver.id, roleAssignmentId: approving.assignmentId };
  return {
    access,
    taxRules,
    preparer,
    approver,
    outsider,
    asPreparer,
    asApprover,
    run,
    asPreparerDo: (work) => run(preparer.id, (context) => work(context, asPreparer)),
    asApproverDo: (work) => run(approver.id, (context) => work(context, asApprover)),
    decide: (requestId, versionId, outcome = 'approve', by = approver) => {
      offsetMs += 30_000;
      if (by.factorSecret === undefined) throw new Error('not enrolled');
      const totpCode = codeFor(by.factorSecret, 0, now());
      return run(by.id, (context) =>
        access.decide(
          context,
          { kind: 'user', id: by.id },
          {
            requestId,
            versionId,
            outcome,
            reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
            totpCode,
          },
        ),
      );
    },
    today: () => now().toISOString().slice(0, 10),
    day: (daysFromToday) => new Date(now().getTime() + daysFromToday * DAY_MS).toISOString().slice(0, 10),
    advanceDays: (days) => {
      offsetMs += days * DAY_MS;
    },
    close: () => router.close(),
  };
}

/**
 * A SYNTHETIC legal entity and tax registration with the code given, written as the migration role, as a fixture
 * (code-house-rules 11.2), for a test that needs a registration to exist without walking the structure's approvals.
 * Returns the registration's identifier.
 */
export async function writeSyntheticTaxRegistration(database: string, code: string): Promise<string> {
  const client = await connect(database, 'migration');
  try {
    const legalEntityId = uuidv7();
    const registrationId = uuidv7();
    await client.query('insert into organisation.legal_entity (id, code) values ($1, $2)', [
      legalEntityId,
      syntheticCode(`LE-${registrationId.slice(-8).toUpperCase()}`),
    ]);
    await client.query('insert into organisation.tax_registration (id, code, legal_entity_id) values ($1, $2, $3)', [
      registrationId,
      code,
      legalEntityId,
    ]);
    return registrationId;
  } finally {
    await client.end();
  }
}

/**
 * A SYNTHETIC stored file with one receipt, written as the migration role, as a fixture (code-house-rules 11.2): a
 * file to attach as the CA's evidence without a file store. Its bytes are never read.
 */
export async function writeSyntheticStoredFile(
  database: string,
  receivedBy: string,
): Promise<{ readonly storedFileId: string; readonly fileReceiptId: string }> {
  const client = await connect(database, 'migration');
  try {
    const storedFileId = uuidv7();
    const fileReceiptId = uuidv7();
    const hash = createHash('sha256').update(storedFileId).digest('hex');
    await client.query(
      `insert into files_imports.stored_file (id, content_hash, size_bytes, format, object_key, encryption_scheme,
         restricted_classes)
       values ($1, $2, 0, 'pdf', $3, 'SYNTHETIC', null)`,
      [storedFileId, hash, `SYNTHETIC/${hash}`],
    );
    await client.query(
      `insert into files_imports.file_receipt (id, stored_file_id, received_by_kind, received_by_id, received_at,
         source_system, claimed_reference_sealed, original_name_sealed, encryption_scheme, correlation_id)
       values ($1, $2, 'user', $3, now(), $4, null, $5, 'SYNTHETIC', $6)`,
      [fileReceiptId, storedFileId, receivedBy, syntheticName('Tests'), syntheticName('CA evidence'), uuidv7()],
    );
    return { storedFileId, fileReceiptId };
  } finally {
    await client.end();
  }
}
