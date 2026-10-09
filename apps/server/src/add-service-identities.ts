import { PinoLoggerService } from './kernel/index.js';
import { runAddServiceIdentities } from './modules/access/index.js';
import { serviceIdentitiesOf } from './setup-organisation.js';
import { jobRegistry } from './worker.module.js';

// Gives an existing Organisation the worker's new service identities,
// `pnpm --filter @apparel-os/server add-service-identities <organisation-code>` (access-and-approvals 9.11a; RR-331;
// product owner, 9 Oct 2026). An operator command like the setup step, never an API route. It reads the identities
// from the worker's registry of this build, as the setup step does, so it is run after a deploy that adds a job kind
// or a consumer (railway-roles-runbook.md). It takes no secret and asks nothing at the prompt.
//
// AOS_RUNTIME_DATABASE_URL (the directory database as aos_runtime) reaches the Organisation's database; it is never
// logged. The answer is printed as one JSON line; the exit code is 0 when added or unchanged, 1 for a refusal or a
// failure.
const logger = new PinoLoggerService();

async function main(): Promise<number> {
  const runtime = process.env.AOS_RUNTIME_DATABASE_URL;
  const [organisationCode] = process.argv.slice(2);
  if (runtime === undefined || runtime === '') {
    logger.error('Refused, nothing changed: AOS_RUNTIME_DATABASE_URL must be set', 'AddServiceIdentities');
    return 1;
  }
  if (organisationCode === undefined || organisationCode === '' || process.argv.length !== 3) {
    logger.error('Refused, nothing changed: give the Organisation code as the one argument', 'AddServiceIdentities');
    return 1;
  }
  const outcome = await runAddServiceIdentities({
    runtimeConnectionString: runtime,
    organisationCode,
    serviceIdentities: serviceIdentitiesOf(jobRegistry),
    logger,
  });
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
  return outcome.outcome === 'refused' ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  logger.error(error, 'AddServiceIdentities');
  process.exitCode = 1;
}
