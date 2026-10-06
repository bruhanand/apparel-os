# Runbook: database roles and the directory database on Railway

Steps the product owner runs once per Railway environment (`dev`, later `kdps-test`), before the first deploy that migrates. It follows [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) sections 4.3 and 5 and [deployment.md](../../../docs/design/platform/deployment.md) section 4. It decides nothing; those documents win. Nothing here has been run yet, and no Railway service was changed by `S0-T05`, `S1-F01-T02` or `S1-F01-T03`.

## What it sets up

| Item | Name | Notes |
| --- | --- | --- |
| Migration role | `aos_migration` | Owns the directory and every Organisation database. Used only by the pre-deploy step, the setup step (CH-1) and test setup |
| Runtime role | `aos_runtime` | Used by `app` and `worker`. Owns nothing, does not bypass row-level security. On `dev` only, it carries the starting time limits for synthetic work (CH-3) |
| Directory database | `aos_directory` | Holds only each Organisation's code and the name of its database on the same server (DEC-093), in `kernel.directory_entry` |
| Pre-deploy variable | `AOS_MIGRATION_DATABASE_URL` | The directory database as `aos_migration`. Never logged |
| Runtime variables | `AOS_RUNTIME_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` | The directory database as `aos_runtime`, and the most connections each database pool opens. `app` refuses to start without either. The URL is never logged |

## Steps

1. **Check the PostgreSQL major version (CH-2, OPEN).** Open a `psql` session to the environment's `postgres` service as its superuser (Railway's "Connect" panel gives the command) and run `show server_version;`. Tests use PostgreSQL 17. If Railway's major version is not 17, stop and raise CH-2 in [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) section 13; the test image and Railway must match before any migration reaches `dev`.
2. **Create the two roles.** In the same session, run the role SQL from the repository: `\i apps/server/db/roles.sql` (from a checkout), or paste its statements. It sets no password.
3. **On `dev` only: set the runtime role's time limits (CH-3, DEC-112, RR-200).** In the same session, run `\i apps/server/db/runtime-limits-synthetic.sql`, or paste its two statements. They set, on the role, a lock wait limit of 1 s and a statement limit of 5 s, the starting values for runtime work on synthetic data; a command that reaches one rolls back and reports the failure. They are tuned after measurement, and a changed value is set the same way, on the role. Skip this step on `kdps-test`: its limits are OPEN (see "Left open"). If the file was ever run there by mistake, undo it with `alter role aos_runtime reset lock_timeout;` and `alter role aos_runtime reset statement_timeout;`.
4. **Set the passwords.** Run `\password aos_migration`, then `\password aos_runtime`. `psql` asks for each without echoing it. Generate each as a long random value and keep it only in the environment's Railway variables (deployment.md section 9). Never put one in the repository, a ticket or a chat.
5. **Create the directory database**, owned by the migration role: `create database aos_directory owner aos_migration;`.
6. **Set the variables** in the environment's Railway variables:
   - On the service that runs the pre-deploy step: `AOS_MIGRATION_DATABASE_URL=postgresql://aos_migration:<password>@<private host>:<port>/aos_directory`, using the private network address of the `postgres` service.
   - On `app` (and `worker`, when it exists): `AOS_RUNTIME_DATABASE_URL=postgresql://aos_runtime:<password>@<private host>:<port>/aos_directory`: the directory database at the same private address, connecting as the runtime role. Each Organisation's database is reached on the same server, as the same role, by the name the directory keeps.
   - On `app` (and `worker`): `AOS_DATABASE_POOL_MAX`, a whole number of at least 1: the most connections each pool opens, one pool for the directory and one per Organisation database. Its value is OPEN ([deployment.md](../../../docs/design/platform/deployment.md) D-7, RR-216) and it has no default; the product owner picks one for the environment and tunes it after measurement. It is a technical setting, not a KDPS value.
7. **Wire the pre-deploy command** when `S1-F01` is first deployed to `dev` (RR-187): `pnpm migrate`. It migrates the directory database, then every Organisation database the directory lists, in code order, each on the same server as the directory and by the name the directory keeps. It stops at the first database that fails and exits non-zero, so the deploy stops and the old version keeps running. It also refuses, before changing anything, a connection string that is not a `postgresql://` URL with a host, a connection that is not `aos_migration` (a superuser included), or a database `aos_migration` does not own.
8. **Check.** Run `pnpm migrate` once by hand, or read the first deploy's log: it prints one line per applied file, naming the directory or the Organisation, then `Migrated the directory database and <n> Organisation database(s): <codes>`. Before the setup step (`S1-F01-T10`) has registered an Organisation, `n` is 0 and the line ends `none listed`. A second run prints only that last line. On `dev`, also connect as `aos_runtime` and run `show lock_timeout;` and `show statement_timeout;`: they answer `1s` and `5s`. On `kdps-test` both answer `0`, which means no limit.

## A local PostgreSQL

The same files set up a PostgreSQL server on a developer's machine, where the data is synthetic. As a superuser, once per server: `psql -f apps/server/db/roles.sql`, then `psql -f apps/server/db/runtime-limits-synthetic.sql` for the runtime role's starting time limits (CH-3, DEC-112, RR-200), then set both passwords with `\password` as in step 4. The limits reach only sessions that start afterwards, so reconnect the application. Check them as in step 8: as `aos_runtime`, `show lock_timeout;` and `show statement_timeout;` answer `1s` and `5s`. The integration tests need none of this: their container runs both files itself.

## Left open

- **CH-3:** the limits of `kdps-test` and production, and longer limits for migration and maintenance (DEC-112). On `kdps-test` no lock wait or statement time limit is set on `aos_runtime`, so PostgreSQL waits without limit until the product owner decides them; they are then set on the role (`alter role aos_runtime set …`), not on a database (code-house-rules 5.1). `dev` has the starting limits for synthetic work (step 3), tuned after measurement.
- **CH-1:** how the setup step holds the migration role's rights to create an Organisation's database.
