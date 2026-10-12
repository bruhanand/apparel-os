import { Client } from 'pg';
import { checkConnectedAsOwner, NotConnectedAsOwner } from '../db/migration-runner.js';
import { RUNTIME_ROLE } from '../db/roles.js';

// The connections of the backup and restore commands (backup-and-restore 3.2, 4.2, 10.3; code-house-rules 5.1; GC9-7).
// Both read and write as the migration role on databases it owns, and the restore's command steps act as the runtime
// role. A connection that is not what it must be refuses the command before anything is written, with a reason that
// names roles and databases only. Any other error, such as PostgreSQL's own words for a failed connection, is never
// made a refusal reason: it propagates, and the command logs its class only (PRD-SEC-014).

/** A refusal before anything is written, its reason in words that name no secret. */
export class OperatorRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'OperatorRefused';
  }
}

/** Runs `work` on one connection, closing it after. */
export async function withConnection<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Runs `work` on one connection as the migration role on a database it owns, or refuses (code-house-rules 5.1): the
 * runtime role, a superuser or another role cannot run the command (PRD-SEC-018).
 */
export function asOwner<T>(
  connectionString: string,
  refused: string,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  return withConnection(connectionString, async (client) => {
    try {
      await checkConnectedAsOwner(client, refused);
    } catch (error) {
      if (error instanceof NotConnectedAsOwner) throw new OperatorRefused(error.message);
      throw error;
    }
    return work(client);
  });
}

/**
 * Whether a connection is the runtime role, as a role that is no superuser and never bypasses row-level security
 * (code-house-rules 5.1, 6): undefined when it is, or what is wrong, naming roles only. The restore's command steps
 * must meet row-level security as `app` does.
 */
export function runtimeRoleProblem(connectionString: string): Promise<string | undefined> {
  return withConnection(connectionString, async (client) => {
    const found = await client.query<{ session_user: string; superuser: boolean; bypasses_rls: boolean }>(
      `select session_user::text as session_user, r.rolsuper as superuser, r.rolbypassrls as bypasses_rls
         from pg_catalog.pg_roles r where r.rolname = session_user`,
    );
    const session = found.rows[0];
    return session?.session_user === RUNTIME_ROLE && !session.superuser && !session.bypasses_rls
      ? undefined
      : `AOS_RUNTIME_DATABASE_URL must connect as ${RUNTIME_ROLE}, which is no superuser and does not bypass row-level security`;
  });
}
