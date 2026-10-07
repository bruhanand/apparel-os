import { readFileSync } from 'node:fs';
import { missingSetupSettings, setupRequestFileSchema, setupRequestSchema } from '@apparel-os/schemas';
import { OUTBOX_AUTHORITY, OUTBOX_PROCESSOR_IDENTITY, PinoLoggerService, type JobRegistry } from './kernel/index.js';
import { runSetupStep, SetupRequestRefused, type ServiceIdentityGrant } from './modules/access/index.js';
import { askWithSecrets } from './operator-prompt.js';
import { jobRegistry } from './worker.module.js';

// The setup step of a new Organisation, `pnpm --filter @apparel-os/server setup-organisation <request.json>`
// (access-and-approvals 9.11; PRD-ACS-023, DEC-101, DEC-112; code-house-rules 4.3, CH-1). An operator command, never
// an API route. The request file holds every non-secret field: the Organisation code, its database's name, each
// first user's login, display name and personas, and the settings with their origin (synthetic on dev). The two
// temporary passwords are typed at the prompt, never in the arguments, and never echoed or logged (3.2).
//
// AOS_MIGRATION_DATABASE_URL (the directory database as aos_migration) creates, migrates and registers;
// AOS_RUNTIME_DATABASE_URL (the directory database as aos_runtime) writes the rows, so row-level security and every
// guard apply. Neither is ever logged (deployment.md section 9). The answer is printed as one JSON line; the exit code
// is 0 for created or completed, 1 for a refusal or a failure.
const logger = new PinoLoggerService();

/**
 * The internal service identities the worker runs as, from what it runs (RR-271, RR-290): the outbox processor, and
 * the identity of each job kind and consumer with the action its steps declare.
 */
export function serviceIdentitiesOf(registry: JobRegistry): ServiceIdentityGrant[] {
  const byCode = new Map<string, ServiceIdentityGrant['authorities'][number][]>([
    [OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]],
  ]);
  for (const step of [...registry.jobKinds, ...registry.consumers]) {
    const authorities = byCode.get(step.serviceIdentity) ?? [];
    if (
      !authorities.some(
        (each) => each.action === step.authorises.action && each.recordType === step.authorises.recordType,
      )
    ) {
      authorities.push(step.authorises);
    }
    byCode.set(step.serviceIdentity, authorities);
  }
  return [...byCode].map(([code, authorities]) => ({ code, authorities }));
}

async function main(): Promise<number> {
  const migration = process.env.AOS_MIGRATION_DATABASE_URL;
  const runtime = process.env.AOS_RUNTIME_DATABASE_URL;
  const file = process.argv[2];
  if (migration === undefined || migration === '' || runtime === undefined || runtime === '') {
    logger.error(
      'Setup refused, nothing changed: AOS_MIGRATION_DATABASE_URL and AOS_RUNTIME_DATABASE_URL must be set',
      'Setup',
    );
    return 1;
  }
  if (file === undefined || process.argv.length !== 3) {
    logger.error('Setup refused, nothing changed: give the request file as the one argument', 'Setup');
    return 1;
  }
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  // Every required security setting is named when left out, before anything else (access-and-approvals 3.1, 9.11;
  // PRD-SEC-017; DEC-118).
  const missing = missingSetupSettings(raw);
  if (missing.length > 0) {
    logger.error(
      `Setup refused, nothing changed: the request leaves out required security settings: ${missing.join(', ')}`,
      'Setup',
    );
    return 1;
  }
  const parsedFile = setupRequestFileSchema.safeParse(raw);
  if (!parsedFile.success) {
    // The issues name fields and rules, never a value: the file holds no secret, and no value is echoed.
    logger.error(
      `Setup refused, nothing changed: the request file is not valid: ${parsedFile.error.issues.map((issue) => `${issue.path.join('.')} ${issue.code}`).join('; ')}`,
      'Setup',
    );
    return 1;
  }
  const typed = await askWithSecrets(
    [],
    ["The first Admin's temporary password", "The first approver's temporary password"],
  );
  const [adminPassword, approverPassword] = typed.secrets;
  if (adminPassword === undefined || approverPassword === undefined) {
    logger.error('Setup refused, nothing changed: a temporary password was empty, or its two entries differ', 'Setup');
    return 1;
  }
  const request = setupRequestSchema.parse({
    ...parsedFile.data,
    firstAdmin: { ...parsedFile.data.firstAdmin, temporaryPassword: adminPassword.reveal() },
    firstApprover: { ...parsedFile.data.firstApprover, temporaryPassword: approverPassword.reveal() },
  });
  try {
    const outcome = await runSetupStep({
      migrationConnectionString: migration,
      runtimeConnectionString: runtime,
      request,
      serviceIdentities: serviceIdentitiesOf(jobRegistry),
      logger,
    });
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
    return outcome.outcome === 'refused' ? 1 : 0;
  } catch (error) {
    if (error instanceof SetupRequestRefused) {
      logger.error(`Setup refused, nothing changed: ${error.message}`, 'Setup');
      return 1;
    }
    throw error;
  }
}

if (process.argv[1]?.endsWith('setup-organisation.js') === true) {
  try {
    process.exitCode = await main();
  } catch (error) {
    logger.error(error, 'Setup');
    process.exitCode = 1;
  }
}
