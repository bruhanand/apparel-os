import type { ClientBase } from 'pg';

const RUNTIME_ROLE = 'aos_runtime';

interface Grant {
  grantee: string;
  privilege_type: string;
}

/**
 * The database step of code-house-rules 4.3 (5.2; PRD-SEC-005): PUBLIC keeps no privilege on the database or on
 * schema `public`; the runtime role gets CONNECT and USAGE on `public`, where the extensions live. Run by the
 * database's owner, the migration role, on every run and on every copy a test makes (11.3), because
 * CREATE DATABASE copies no database-level privilege. A revoke PostgreSQL cannot apply only warns, so the
 * privileges are read back and any difference is an error.
 */
export async function applyDatabasePrivileges(client: ClientBase): Promise<void> {
  const result = await client.query<{ name: string }>('select current_database() as name');
  const database = client.escapeIdentifier(result.rows[0]?.name ?? '');
  await client.query(`revoke all on database ${database} from public`);
  await client.query(`grant connect on database ${database} to ${RUNTIME_ROLE}`);
  await client.query('revoke all on schema public from public');
  await client.query(`grant usage on schema public to ${RUNTIME_ROLE}`);

  // Grants to anyone but the owner. acldefault stands in for a null ACL, which means PostgreSQL's defaults.
  const onDatabase = await client.query<Grant>(`
    select coalesce(r.rolname, 'PUBLIC') as grantee, a.privilege_type
    from pg_catalog.pg_database d
    cross join lateral pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
    left join pg_catalog.pg_roles r on r.oid = a.grantee
    where d.datname = current_database() and a.grantee <> d.datdba`);
  const onPublic = await client.query<Grant>(`
    select coalesce(r.rolname, 'PUBLIC') as grantee, a.privilege_type
    from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
    left join pg_catalog.pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and a.grantee <> n.nspowner`);

  expectExactly('the database', onDatabase.rows, `${RUNTIME_ROLE} CONNECT`);
  expectExactly('schema public', onPublic.rows, `${RUNTIME_ROLE} USAGE`);
}

function expectExactly(object: string, grants: readonly Grant[], expected: string): void {
  const found = grants.map((grant) => `${grant.grantee} ${grant.privilege_type}`).sort();
  if (found.length !== 1 || found[0] !== expected) {
    throw new Error(`Privileges on ${object} are [${found.join(', ')}], expected [${expected}]`);
  }
}
