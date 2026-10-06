import { credentialResetKindSchema } from '@apparel-os/schemas';
import { PinoLoggerService } from './kernel/index.js';
import { runRecovery } from './modules/access/index.js';
import { askWithSecrets } from './operator-prompt.js';

// The recovery command for the first two users,
// `pnpm --filter @apparel-os/server recover-first-user <organisation-code> <login> <password|authenticator|both>`
// (access-and-approvals 3.2; GC3-13, DEC-116). An operator command like the setup step, never an API route. The
// operator types, at the prompt, how the person's identity was verified and, for a password reset, the new temporary
// password, which is never echoed or logged and is handed over in person (DEC-099).
//
// AOS_RUNTIME_DATABASE_URL (the directory database as aos_runtime) reaches the Organisation's database; it is never
// logged. The answer is printed as one JSON line; the exit code is 0 when recovered, 1 for a refusal or a failure.
const logger = new PinoLoggerService();

async function main(): Promise<number> {
  const runtime = process.env.AOS_RUNTIME_DATABASE_URL;
  const [organisationCode, login, kind] = process.argv.slice(2);
  if (runtime === undefined || runtime === '') {
    logger.error('Recovery refused, nothing changed: AOS_RUNTIME_DATABASE_URL must be set', 'Recovery');
    return 1;
  }
  const reset = credentialResetKindSchema.safeParse(kind);
  if (organisationCode === undefined || login === undefined || !reset.success || process.argv.length !== 5) {
    logger.error(
      'Recovery refused, nothing changed: give the Organisation code, the login and password, authenticator or both',
      'Recovery',
    );
    return 1;
  }
  const typed = await askWithSecrets(
    ["How was the person's identity verified"],
    reset.data === 'authenticator' ? [] : ['The new temporary password'],
  );
  if (reset.data !== 'authenticator' && typed.secrets[0] === undefined) {
    logger.error(
      'Recovery refused, nothing changed: the temporary password was empty, or its two entries differ',
      'Recovery',
    );
    return 1;
  }
  const outcome = await runRecovery({
    runtimeConnectionString: runtime,
    organisationCode,
    login,
    reset: reset.data,
    temporaryPassword: typed.secrets[0],
    identityVerification: typed.visible[0] ?? '',
    logger,
  });
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
  return outcome.outcome === 'recovered' ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  logger.error(error, 'Recovery');
  process.exitCode = 1;
}
