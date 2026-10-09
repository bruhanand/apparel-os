# Runbook: database roles and the directory database on Railway

Steps the product owner runs once per Railway environment (`dev`, later `kdps-test`), before the first deploy that migrates. It follows [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) sections 4.3 and 5 and [deployment.md](../../../docs/design/platform/deployment.md) section 4. It decides nothing; those documents win. Steps 1 to 8 were run on `dev` on 7 Oct 2026, with the product owner's authorisation: 1 to 6 before the first deploy, 7 and 8 at the merge of `s1/f01-first-access` into `main`; see "Done on `dev`" below. Nothing has been run on `kdps-test`, which does not exist yet.

## What it sets up

| Item | Name | Notes |
| --- | --- | --- |
| Migration role | `aos_migration` | Owns the directory and every Organisation database. Used only by the pre-deploy step, the setup step (CH-1) and test setup |
| Runtime role | `aos_runtime` | Used by `app` and `worker`. Owns nothing, does not bypass row-level security. On `dev` only, it carries the starting time limits for synthetic work (CH-3) |
| Directory database | `aos_directory` | Holds only each Organisation's code and the name of its database on the same server (DEC-093), in `kernel.directory_entry` |
| Pre-deploy variable | `AOS_MIGRATION_DATABASE_URL` | The directory database as `aos_migration`. Never logged |
| Runtime variables | `AOS_RUNTIME_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` | The directory database as `aos_runtime`, and the most connections each database pool opens. `app` and `worker` refuse to start without either. The URL is never logged |
| Other `app` variables | `AOS_ENVIRONMENT`, `AOS_PUBLIC_ORIGIN`, `AOS_TRUSTED_PROXY_HOPS`, `AOS_ORGANISATION_KEYS` | The environment's name (also read when the web app is built), the app's own origin, the proxies in front of it, and a key per Organisation (deployment.md sections 1, 3, 9; RR-254). `app` refuses to start without the last three |
| `worker` variables | `AOS_WORKER_SETTINGS` | Besides the two runtime variables: the retry and interval settings of every consumer and job kind in the worker's registry (code-house-rules 12.9; DEC-118, DEC-119; RR-276, RR-322). The worker refuses to start without it or with a consumer or job kind missing |

## Steps

1. **Check the PostgreSQL major version (CH-2, OPEN).** Open a `psql` session to the environment's `postgres` service as its superuser (Railway's "Connect" panel gives the command) and run `show server_version;`. Tests use PostgreSQL 17. If Railway's major version is not 17, stop and raise CH-2 in [code-house-rules.md](../../../docs/design/platform/code-house-rules.md) section 13; the test image and Railway must match before any migration reaches `dev`.
2. **Create the two roles.** In the same session, run the role SQL from the repository: `\i apps/server/db/roles.sql` (from a checkout), or paste its statements. It sets no password.
3. **On `dev` only: set the runtime role's time limits (CH-3, DEC-112, RR-200).** In the same session, run `\i apps/server/db/runtime-limits-synthetic.sql`, or paste its two statements. They set, on the role, a lock wait limit of 1 s and a statement limit of 5 s, the starting values for runtime work on synthetic data; a command that reaches one rolls back and reports the failure. They are tuned after measurement, and a changed value is set the same way, on the role. Skip this step on `kdps-test`: its limits are OPEN (see "Left open"). If the file was ever run there by mistake, undo it with `alter role aos_runtime reset lock_timeout;` and `alter role aos_runtime reset statement_timeout;`.
4. **Set the passwords.** Run `\password aos_migration`, then `\password aos_runtime`. `psql` asks for each without echoing it. Generate each as a long random value and keep it only in the environment's Railway variables (deployment.md section 9). Never put one in the repository, a ticket or a chat.
5. **Create the directory database**, owned by the migration role: `create database aos_directory owner aos_migration;`.
6. **Set the variables** in the environment's Railway variables:
   - On the service that runs the pre-deploy step: `AOS_MIGRATION_DATABASE_URL=postgresql://aos_migration:<password>@<private host>:<port>/aos_directory`, using the private network address of the `postgres` service.
   - On `app` (and `worker`, when it exists): `AOS_RUNTIME_DATABASE_URL=postgresql://aos_runtime:<password>@<private host>:<port>/aos_directory`: the directory database at the same private address, connecting as the runtime role. Each Organisation's database is reached on the same server, as the same role, by the name the directory keeps.
   - On `app` (and `worker`): `AOS_DATABASE_POOL_MAX`, a whole number of at least 1: the most connections each pool opens, one pool for the directory and one per Organisation database. It has no default. It is a technical setting, not a KDPS value.
     - **On `dev`: `5`**, a development assumption (product owner, 6 Oct 2026; [deployment.md](../../../docs/design/platform/deployment.md) section 4 and D-7, RR-216). Before setting it, check the total against the database's connection budget: 5 for each pool (the directory and every Organisation database) of each `app` instance and each worker, plus the migration and operator connections, must fit within the connections the `postgres` service allows (`show max_connections;` in the step 1 session). Then tune it from measurements; a changed value is set the same way.
     - **On `kdps-test`:** OPEN (D-7, RR-216), set only after measurement.
7. **Wire the pre-deploy command** when `S1-F01` is first deployed to `dev` (RR-187): `pnpm migrate`. It migrates the directory database, then every Organisation database the directory lists, in code order, each on the same server as the directory and by the name the directory keeps. It stops at the first database that fails and exits non-zero, so the deploy stops and the old version keeps running. It also refuses, before changing anything, a connection string that is not a `postgresql://` URL with a host, a connection that is not `aos_migration` (a superuser included), or a database `aos_migration` does not own.
8. **Check.** Run `pnpm migrate` once by hand, or read the first deploy's log: it prints one line per applied file, naming the directory or the Organisation, then `Migrated the directory database and <n> Organisation database(s): <codes>`. Before the setup step (`S1-F01-T10`) has registered an Organisation, `n` is 0 and the line ends `none listed`. A second run prints only that last line. On `dev`, also connect as `aos_runtime` and run `show lock_timeout;` and `show statement_timeout;`: they answer `1s` and `5s`. On `kdps-test` both answer `0`, which means no limit.

## Done on `dev` (7 Oct 2026)

Authorised by the product owner on 7 Oct 2026. The list below is the state before the first deploy; what the merge into `main` did follows it, under "At the merge".

- **Project** `apparel-os`, one environment `dev` (Railway's default environment, renamed). No `kdps-test`.
- **Region:** Asia Southeast (Singapore, `asia-southeast1-eqsg3a`) for every service and the database volume; the bucket in `sin` (deployment.md section 8).
- **`Postgres`:** Railway's PostgreSQL template on the image `ghcr.io/railwayapp-templates/postgres-ssl:17`; step 1 answered `17.11`, so CH-2's match with the tests holds. Private network only (`postgres.railway.internal`), no public TCP proxy. `max_connections` is 500.
- **Steps 1 to 6** were run through `railway ssh` into the `Postgres` service, as its superuser: `roles.sql`, `runtime-limits-synthetic.sql`, both passwords (generated locally with a CSPRNG and sent only as SCRAM verifiers), and `aos_directory` owned by `aos_migration`. Checked: `aos_runtime` signs in and answers `1s` and `5s`; `aos_migration` signs in. The plain passwords exist only inside the Railway variables.
- **`app`:** empty service (no source yet). Build `pnpm build`; start `pnpm --filter @apparel-os/server start`; pre-deploy `pnpm migrate` (step 7); health check `/api/health`; public domain `app-dev-53bf.up.railway.app`. Variables: `AOS_RUNTIME_DATABASE_URL`, `AOS_MIGRATION_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` (`5`), `AOS_ENVIRONMENT` (`dev`), `AOS_PUBLIC_ORIGIN` (`https://` and that domain), `AOS_TRUSTED_PROXY_HOPS` (`1`, Railway's one edge proxy; check it against the access record at the first deploy), `AOS_ORGANISATION_KEYS` (a 32-byte key for each of the two synthetic Organisations, `SYN-ORG-A` and `SYN-ORG-B`). The database URLs reach the host through `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}`.
- **`worker`:** empty service, no public domain. Build `pnpm build`; start `pnpm --filter @apparel-os/server start:worker`. Variables: `AOS_RUNTIME_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` (`5`), `AOS_ENVIRONMENT` (`dev`), `AOS_WORKER_SETTINGS`: the SYNTHETIC values of `apps/server/test/fixtures/SYNTHETIC-worker-settings.local.json` (DEC-118, DEC-119), with retry settings for `inbox.publish-approval` and `inbox.close-approval` (RR-322). The grants rebuild's hourly interval is the labelled synthetic value, not an approved one (RR-390). The worker holds neither the migration URL nor the Organisation keys: it reads neither.
- **Bucket** `files` (D-2, `DEC-105`). Not yet wired to `app` or `worker`. Since `S1-F06-T05` the code reads six variables (`AOS_FILE_STORE_ENDPOINT`, `_REGION`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_ADDRESSING`; deployment.md section 9); with none set, file storage is unavailable and the service still starts. Setting them waits for the product owner's authorisation of the Railway environment (RR-187).
- **Connection budget (step 6):** directory plus two Organisation pools, 5 each, for one `app` and one `worker` is 30, plus the migration and operator connections, against 500. It fits.

### At the merge of `s1/f01-first-access` into `main`

Done on 7 Oct 2026, after the product owner approved the merge and the deploy to `dev` (`main` at `86f08ce`):

- **Source.** The GitHub repository `bruhanand/apparel-os`, branch `main`, connected to `app` and to `worker` with the Railway CLI (`railway service source connect`); each has a deploy trigger on `main` (automatic deploys). No GitHub app step or terms were asked for. Railpack built both with `pnpm build` in about a minute.
- **`app`.** The pre-deploy `pnpm migrate` applied `0001__kernel__migration_record.sql` and `0002__kernel__directory_entry.sql` to the directory database and printed `Migrated the directory database and 0 Organisation database(s): none listed`. The health check passed; `GET /api/health` on the public domain answers `200 {"status":"ok"}`. `/` and a deep link such as `/sign-in` serve the web app; its bundle was built with `AOS_ENVIRONMENT` `dev`, so the banner reads `dev · SYNTHETIC data only`. `GET /api/access/session` without a session answers `401`.
- **Seed and setup.** `pnpm seed` from `railway ssh --service app`, with `AOS_SEED_FIRST_USERS_FILE` naming a `SYNTHETIC-*.secrets.json` file in the container's `/tmp`. It ran the setup step for both synthetic Organisations: `SYN-ORG-A` in `syn_org_a` and `SYN-ORG-B` in `syn_org_b`, each `created` with its own first Admin (`syn-admin-a`, `syn-admin-b`) and first approver (`syn-approver-a`, `syn-approver-b`) and the seed's labelled SYNTHETIC settings. The seed runs the setup step itself, so `setup-organisation` was not run separately. The temporary passwords were copied to the product owner's machine, in a git-ignored `SYNTHETIC-dev-first-users.secrets.json` at the repository root, readable by its owner only, and the container's copy was deleted. Each must be changed at first sign-in.
- **Second migrate.** A `pnpm migrate` by hand afterwards printed only `Migrated the directory database and 2 Organisation database(s): SYN-ORG-A, SYN-ORG-B`.
- **`worker`.** Its log shows `The worker is running`, then, within two minutes of the seed and with no restart, its job steps (`audit.ensure-partitions`, `audit.check-seals`, `audit.check-partition-coverage`, `audit.seal-closed-block`, `access.rebuild-grants`) ending `done` for both `SYN-ORG-A` and `SYN-ORG-B`.
- **Role limits (step 8).** As `aos_runtime`, in `aos_directory`, `syn_org_a` and `syn_org_b`: `lock_timeout` `1s`, `statement_timeout` `5s`, not a superuser. No log line of `app` or `worker` reports a timeout. Measuring them under real use (RR-200) waits for Demo 1's traffic.
- **Not yet checked.** `AOS_TRUSTED_PROXY_HOPS` (`1`) against the address in the access record of a real sign-in (RR-254): it needs a sign-in, which Demo 1 makes.

The steps as planned:


1. Connect the GitHub repository to `app` and to `worker`, branch `main`, with automatic deploys on. Connecting it deploys both.
2. Watch the `app` deploy: the pre-deploy `pnpm migrate` prints `Migrated the directory database and 0 Organisation database(s): none listed` (step 8). A failure stops the deploy.
3. Set up the two synthetic Organisations: `pnpm seed` from a shell in `app` (`railway ssh --service app`); it refuses unless both `AOS_ENVIRONMENT` and the Railway environment are `dev`. Then the setup step (`setup-organisation`) for each, as AGENTS.md "Code workspace" says.
4. Read the `worker` log for `The worker is running`; it starts serving each Organisation the directory newly lists on its next pass, with no restart.
5. Check step 8's role limits again and `GET /api/health` on the public domain.
6. Open the public domain at `/`: the web app's sign-in page, with the `dev` banner. The server serves the web app from `apps/web/dist`, which `pnpm build` makes with `AOS_ENVIRONMENT` from the service's variables (deployment.md section 3; `S1-F01-T27`).

## After a deploy that adds a job kind or a consumer

The setup step gives an Organisation the worker's service identities as the registry stood when it ran. A deploy whose worker registry needs a new identity (a new job kind or consumer, such as the `exceptions` identity of `S1-F08-T02`) leaves every Organisation set up before it without that identity, and the worker ends those steps `identity-not-enabled` (access-and-approvals 9.11a; RR-331). After such a deploy, and once the `app` deploy, with its pre-deploy `pnpm migrate`, has finished, run for each Organisation the directory lists, from a shell in `app` (`railway ssh --service app`), which holds `AOS_RUNTIME_DATABASE_URL` and the build:

```sh
pnpm --filter @apparel-os/server add-service-identities <organisation-code>
```

It prints one JSON line: `added` with the codes it wrote, `unchanged` when nothing was missing, or `refused` with its reason (exit code 1). A `grants-differ` refusal names an identity that exists with other grants; nothing was written, and it is not corrected by this command. The worker picks the new identity up at its next step, with no restart; a job that already failed `identity-not-enabled` stays failed until an operator runs it again (code-house-rules 12.9). Running it when nothing is missing is harmless. Whether the command needs a decision entry under `PRD-ACS-023` before use outside `dev` is RR-457.

## A local PostgreSQL

The same files set up a PostgreSQL server on a developer's machine, where the data is synthetic. As a superuser, once per server: `psql -f apps/server/db/roles.sql`, then `psql -f apps/server/db/runtime-limits-synthetic.sql` for the runtime role's starting time limits (CH-3, DEC-112, RR-200), then set both passwords with `\password` as in step 4. The limits reach only sessions that start afterwards, so reconnect the application. Check them as in step 8: as `aos_runtime`, `show lock_timeout;` and `show statement_timeout;` answer `1s` and `5s`. The integration tests need none of this: their container runs both files itself.

## Left open

- **CH-3:** the limits of `kdps-test` and production, and longer limits for migration and maintenance (DEC-112). On `kdps-test` no lock wait or statement time limit is set on `aos_runtime`, so PostgreSQL waits without limit until the product owner decides them; they are then set on the role (`alter role aos_runtime set …`), not on a database (code-house-rules 5.1). `dev` has the starting limits for synthetic work (step 3), tuned after measurement.
- **CH-1:** how the setup step holds the migration role's rights to create an Organisation's database.
- **RR-216:** `AOS_DATABASE_POOL_MAX` on `kdps-test` and production, set only after measurement. `dev` has `5` per pool as a development assumption (step 6).
