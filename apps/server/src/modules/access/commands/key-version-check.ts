import { uuidv7 } from '@apparel-os/domain';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  COMMAND_RUNNER,
  LOGGER,
  newCorrelationId,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
  type StructuredLogger,
} from '../../../kernel/index.js';
import { keyVersion } from '../db/schema.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { ORGANISATION_KEYS } from '../tokens.js';

// The start check of key versions (backup-and-restore 2.4; GC9-18, product owner, 10 Oct 2026; POL-18.02,
// PRD-SEC-014; S1-F14-T02). At start the server computes the identifier of each Organisation's data key in its
// environment and refuses to start when it is not a version that Organisation's database lists, naming the
// Organisation code and the identifiers, never the key. A damaged or swapped key is then never used to write data no
// one can open later.
//
// An Organisation whose database lists no version yet, one set up before key versions were recorded or since the last
// start, has its environment key recorded as its first version, the time it was first used (backup-and-restore 2.4
// "As built"): until then nothing names a version to compare with. An Organisation the directory lists and the
// environment holds no key for is left as before: the key refuses when it is first needed (deployment.md section 9).

/** The key in the environment is not a version the Organisation's database lists. Names identifiers, never a key. */
export class KeyVersionNotListed extends Error {
  constructor(readonly mismatches: readonly { code: string; environment: string; listed: readonly string[] }[]) {
    super(
      `The server refuses to start: ${mismatches
        .map(
          (each) =>
            `Organisation ${each.code}'s key in the environment is version ${each.environment}, which its database does not list (it lists ${each.listed.join(', ')})`,
        )
        .join('; ')}. Put back the kept copy of a listed version (backup-and-restore 2.4)`,
    );
    this.name = 'KeyVersionNotListed';
  }
}

/** Compares, and where none is listed records, each Organisation's key version. Throws on a difference. */
export async function checkKeyVersions(
  router: OrganisationRouter,
  runner: CommandRunner,
  keys: OrganisationKeys,
  logger: StructuredLogger,
): Promise<void> {
  const versions = keys.versions();
  const mismatches: { code: string; environment: string; listed: string[] }[] = [];
  for (const organisation of await router.listOrganisations()) {
    const environment = versions.get(organisation.organisationCode);
    if (environment === undefined) continue;
    const listed = await runner.run(
      {
        commandName: 'access.check-key-version',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'start-check' },
      },
      async (context) => {
        const rows = await context.tx
          .select({ identifier: keyVersion.identifier })
          .from(keyVersion)
          .where(eq(keyVersion.purpose, 'organisation-data'))
          .orderBy(keyVersion.firstUsedAt);
        if (rows.length > 0) return rows.map((row) => row.identifier);
        await context.tx
          .insert(keyVersion)
          .values({
            id: uuidv7(),
            identifier: environment,
            purpose: 'organisation-data',
            firstUsedAt: context.startedAt,
          })
          .onConflictDoNothing({ target: keyVersion.identifier });
        logger.structured(
          'info',
          { organisationCode: organisation.organisationCode, keyVersion: environment },
          "Recorded the environment's key as the Organisation's first key version",
          'KeyVersionCheck',
        );
        return [environment];
      },
    );
    if (!listed.includes(environment)) {
      mismatches.push({ code: organisation.organisationCode, environment, listed });
    }
  }
  if (mismatches.length > 0) throw new KeyVersionNotListed(mismatches);
}

/** Runs the check when the application starts, before it serves any request. */
@Injectable()
export class KeyVersionStartCheck implements OnApplicationBootstrap {
  constructor(
    @Inject(ORGANISATION_ROUTER) private readonly router: OrganisationRouter,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ORGANISATION_KEYS) private readonly keys: OrganisationKeys,
    @Inject(LOGGER) private readonly logger: StructuredLogger,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return checkKeyVersions(this.router, this.runner, this.keys, this.logger);
  }
}
