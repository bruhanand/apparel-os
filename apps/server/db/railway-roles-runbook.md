# Runbook: database roles and the directory database on Railway

Steps the product owner runs once per Railway environment (`dev`, later `kdps-test`), before the first deploy that migrates. It follows [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) sections 4.3 and 5 and [deployment.md](../../../docs/design/platform/deployment.md) section 4. It decides nothing; those documents win. Nothing here has been run yet, and no Railway service was changed by `S0-T05`.

## What it sets up

| Item | Name | Notes |
| --- | --- | --- |
| Migration role | `aos_migration` | Owns the directory and every Organisation database. Used only by the pre-deploy step, the setup step (CH-1) and test setup |
| Runtime role | `aos_runtime` | Used by `app` and `worker`. Owns nothing, does not bypass row-level security |
| Directory database | `aos_directory` | Holds only each Organisation's code and where its database is (DEC-093). Its table arrives with `S1-F01-T02` |
| Pre-deploy variable | `AOS_MIGRATION_DATABASE_URL` | The directory database as `aos_migration`. Never logged |

## Steps

1. **Check the PostgreSQL major version (CH-2, OPEN).** Open a `psql` session to the environment's `postgres` service as its superuser (Railway's "Connect" panel gives the command) and run `show server_version;`. Tests use PostgreSQL 17. If Railway's major version is not 17, stop and raise CH-2 in [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) section 13; the test image and Railway must match before any migration reaches `dev`.
2. **Create the two roles.** In the same session, run the role SQL from the repository: `\i apps/server/db/roles.sql` (from a checkout), or paste its statements. It sets no password.
3. **Set the passwords.** Run `\password aos_migration`, then `\password aos_runtime`. `psql` asks for each without echoing it. Generate each as a long random value and keep it only in the environment's Railway variables (deployment.md section 9). Never put one in the repository, a ticket or a chat.
4. **Create the directory database**, owned by the migration role: `create database aos_directory owner aos_migration;`.
5. **Set the variables** in the environment's Railway variables:
   - On the service that runs the pre-deploy step: `AOS_MIGRATION_DATABASE_URL=postgresql://aos_migration:<password>@<private host>:<port>/aos_directory`, using the private network address of the `postgres` service.
   - The runtime connection for `app` and `worker` is set when `S1-F01-T02` adds Organisation routing, which names that variable.
6. **Wire the pre-deploy command** when `S1-F01` is first deployed to `dev` (RR-187): `pnpm migrate`. It migrates the directory database, then each Organisation database the directory lists, and exits non-zero on the first failure, so the deploy stops and the old version keeps running.
7. **Check.** Run `pnpm migrate` once by hand, or read the first deploy's log: it prints one line per applied file and `Migrations complete`. A second run prints only `Migrations complete`.

## Left open

- **CH-3:** no lock wait or statement time limit is set on `aos_runtime`. PostgreSQL waits without limit until the product owner decides them; they are then set on the role (`alter role aos_runtime set …`), not on a database (code-house-rules 5.1).
- **CH-1:** how the setup step holds the migration role's rights to create an Organisation's database.
