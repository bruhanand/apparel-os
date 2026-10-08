# Test deployment on Railway

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026; amended 6 Oct 2026 for the product owner's decisions on the `dev` pool size, Railway authorisation and the counter's path. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements: PRD "Technical platform" (Stack: Hosting, Authentication, Live updates, Jobs, Files, Hardware, Diagnostics); `PRD-MOD-001`; `PRD-ACS-017`, `PRD-ACS-020`; `PRD-INT-006`, `PRD-INT-007`, `PRD-INT-009`; `PRD-SEC-001`, `PRD-SEC-005`, `PRD-SEC-009`, `PRD-SEC-010`, `PRD-SEC-012`, `PRD-SEC-014`; `PRD-OFF-002`; `PRD-PRF-001`; `PRD-PTW-008`; `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`, `PRD-LIF-026`. Decisions: DEC-027, DEC-028, DEC-053, DEC-071, DEC-084, DEC-093, DEC-102, DEC-103, DEC-105. Policies: 2 (sessions, `POL-02.17`, `POL-02.18`), 18 (`POL-18.01`, `POL-18.03`).

**Covers test hosting only.** Production hosting is chosen before the first Store switch (`PRD-LIF-026`) and gets its own document.

---

## 1. Two environments, never mixed

One Railway project with two environments. Each has its own services, databases, variables and private network.

| Environment | Data | Who uses it | Deploys |
| --- | --- | --- | --- |
| `dev` | Synthetic only, labelled as synthetic | The product owner and developers | Automatically from the main branch |
| `kdps-test` | Real KDPS data for the side-by-side test | KDPS staff, through app logins only | Only by manually promoting a commit already tested on `dev` |

- Never copy data between the two. Synthetic data never becomes a default (AGENTS rule).
- `kdps-test` holds real data only after KDPS agrees to it (KDPS Owner question 37).
- Only the product owner has access to the Railway project. KDPS users get app logins, never Railway access.
- Railway setup and each deploy need the product owner's separate authorisation (product owner, 6 Oct 2026). On `dev` a merge into the main branch deploys, so an approval to merge must say explicitly that it includes that deployment (product owner, 6 Oct 2026, `DEC-117`).
- On `kdps-test`, actions whose policy is not signed stay disabled, even with real data. Only imports and checks that need no gated action run (`DEC-071`). So that KDPS staff can sign in for them, sessions there use the limits `POL-02.18` states before policy 2 is signed (`DEC-102`). So that they can do them, KDPS staff get role assignments prepared from what KDPS tells us and approved like any other access change (`PRD-ACS-023`), as settings of the test setup and not the signed role map of `POL-02.11` (`DEC-103`). None of these enables a gated action. Approving those assignments needs a reason list in force: the first list, with the reasons KDPS gives, is a setting of the test setup, approved first with a free-text reason (`DEC-105`, `DEC-104`; [access-and-approvals.md](../access/access-and-approvals.md) GC3-12). The app shows an environment banner.
- One variable, `AOS_ENVIRONMENT` (`local`, `dev` or `kdps-test`), names the environment for both the local seed ([code-house-rules.md](code-house-rules.md) 11.2) and the screen banner. The web app reads it when it is built, the only build variable it reads, since each environment builds its own `app`; a build without it, or with another value, shows a banner saying the environment is not named, never one of the three (RR-193). **Design choice**, built in `S1-F01-T14`.

## 2. Services in each environment

| Service | What runs | Reachable from |
| --- | --- | --- |
| `app` | NestJS server: the API under `/api`, live updates (SSE), and the built web app and counter PWA as static files | The public internet over HTTPS (one public address) |
| `worker` | The same build with a different start command (`pnpm --filter @apparel-os/server start:worker`, built as `dist/worker.js`): pg-boss jobs and the outbox processor, and the scheduled audit partition upkeep, independent of deploys (DEC-118, RR-240; [numbering-and-audit.md](numbering-and-audit.md) 4.4). It needs `AOS_RUNTIME_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` and its settings in `AOS_WORKER_SETTINGS` ([code-house-rules.md](code-house-rules.md) 12.9; DEC-118, DEC-119; RR-276) | Private network only |
| `postgres` | Railway PostgreSQL. pg-boss tables live here too (Stack: Jobs) | Private network only. No public proxy on `kdps-test` |
| File storage | A Railway bucket: S3-compatible storage for documents and photos (Stack: Files; D-2, `DEC-105`) | Only `app` and `worker` hold its credentials. Files are encrypted by the app and served through `app`, never by a link straight to the bucket ([imports-and-opening-data.md](imports-and-opening-data.md) section 11) |
| `forecast` | Python forecasting service. Added in stage 6, as one more service in the same hosting as the app (`DEC-105`; module-map section 10) | Private network only |

Services talk to each other over Railway's private network (`*.railway.internal`), which is scoped to one environment. So `dev` can never reach `kdps-test`.

**What exists (7 Oct 2026).** The Railway project `apparel-os` with the `dev` environment only: `Postgres` (PostgreSQL 17.11, private only), `app` and `worker`, deployed from `main` with automatic deploys since the merge of `S1-F01` (7 Oct 2026), and the bucket `files`, all in Asia Southeast. The directory and the two synthetic Organisations' databases are migrated, and both Organisations are set up by the seed. The services, settings, variable names and what the first deploy did are in [railway-roles-runbook.md](../../../apps/server/db/railway-roles-runbook.md) "Done on `dev`". `kdps-test` is not created.

## 3. One address for the browser

The `app` service serves the API, the web app and the counter PWA from **one origin**: `/` is the web app, `/counter/` is the counter PWA, built from `apps/counter` (approved by the product owner on 6 Oct 2026; [offline-counter.md](../pos/offline-counter.md) 5.2), and `/api/` is the API ([code-house-rules.md](code-house-rules.md) 12.1).

How `app` serves the web app (**design choice**, built in `S1-F01-T27`):

- `pnpm build` builds `apps/web` into `apps/web/dist`, beside the server's own build, and the server serves it from there; it refuses to start without the web app's `index.html`. The web build reads `AOS_ENVIRONMENT` from the build's environment (section 1), so on Railway the variable set on `app` reaches it, and the build cache keys on it.
- A `GET` or `HEAD` outside `/api/` answers the build's file at that path. A path whose last segment has no file extension is a client route and answers `index.html`, so a reload or a link opens the screen. Anything else outside `/api/`, a missing file included, answers the not-found error envelope, never `index.html`; so does an unknown path under `/api/` ([code-house-rules.md](code-house-rules.md) 12.3).
- Caching: the build's hashed files under `/assets/` may be kept by a browser for a year (`immutable`), since a new build names new files; `index.html` is never kept (`no-store`), so a deploy reaches the next page load; any other file, such as the self-hosted fonts, is revalidated on each use (`no-cache`). Every `/api` answer stays `no-store` (12.1).
- Every answer, page or API, carries `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`: a page loads scripts, styles, fonts, images and API calls only from its own origin, no other site frames it, and no referrer leaves it.
- `/counter/` answers not-found until `apps/counter` exists and is built (RR-420).

Why one origin:

- Sessions are PostgreSQL-backed server sessions in a cookie (`PRD-SEC-001`; Stack: Authentication). With one origin, the cookie is first-party. It needs no cross-site settings, which browsers increasingly block, and no CORS.
- Cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, host-only (no `Domain` attribute), path `/`, named `__Host-aos-session` (access-and-approvals 3.3).
- The server is told its own origin in `AOS_PUBLIC_ORIGIN` (on Railway, `https://` and the service's public domain), and how many proxies in front of it add to `X-Forwarded-For` in `AOS_TRUSTED_PROXY_HOPS`, so it can refuse a command from another site and know a request's source address for the access record and sign-in throttling ([code-house-rules.md](code-house-rules.md) 12.1; access-and-approvals 3.1). Neither has a default; the server refuses to start without them. **Design choice.**
- The PWA service worker and IndexedDB belong to the same origin as the API that registers the device (`PRD-OFF-002`).
- Sign-in asks for the Organisation code as well as the login (DEC-093). The server finds the Organisation in the directory (section 4), then the user and the session in that Organisation's database. A user belongs to one Organisation (`PRD-ACS-020`). **Design choice:** a browser is signed in to one Organisation at a time.
- The cost: web, counter and server deploy together. That is acceptable for testing, since they share one repository.

`kdps-test` uses the Railway-provided address. A custom domain can be added later (D-3, `DEC-105`).

Idle and absolute session limits come from policy 2 (`POL-02.18`). On production they apply once policy 2 is signed and the Admin has validated them (V-04); on `kdps-test` the stated values apply before signing (`DEC-102`, section 1). Production and `kdps-test` require TOTP (`PRD-SEC-001`, `POL-02.17`). Development uses the same sign-in as production, with synthetic users; the one easier path is the test sign-in of `local` and `dev` (DEC-121; [access-and-approvals.md](../access/access-and-approvals.md) 3.4), on only where `AOS_ENVIRONMENT` is `local` or `dev` and `AOS_DEMO_SIGN_IN` lists SYNTHETIC people, and the server refuses to start with it set anywhere else, so nothing in it weakens production login and its test access stays apart from production authentication (`PRD-ACS-017`, `POL-02.17`; D-6, `DEC-105`). Hosting changes none of this.

## 4. Database

- **One database per Organisation** (`PRD-MOD-001`).
  - `kdps-test`: one database for KDPS.
  - `dev`: at least two synthetic Organisations, so tests prove one cannot see the other.
- **A small directory database** beside them holds only each Organisation's code and where its database is. It holds no users, sessions or business records (DEC-093, `PRD-ACS-020`). It lives in the same `postgres` service, with its own migrations.
  - **Where its database is** is the name of the Organisation's database on the same PostgreSQL server as the directory: letters, digits and `_`, at most 63 characters. The server reaches it with the directory's own connection and role, pointed at that name. **Design choice.**
- **Two database roles:**
  - A *migration role* owns the tables and runs reviewed SQL migrations (Stack: Database access).
  - A *runtime role* is used by `app` and `worker`. It neither owns the tables nor bypasses row-level security, so PostgreSQL scope controls always apply (`PRD-SEC-005`).
- **Connections.** `app` and `worker` connect to the directory database as the runtime role through the variable `AOS_RUNTIME_DATABASE_URL`, and to each Organisation's database on the same server through it; the pre-deploy step does the same as the migration role through `AOS_MIGRATION_DATABASE_URL`. Neither is ever logged (section 9). Each database the server reaches has its own pool of connections, of at most `AOS_DATABASE_POOL_MAX`. **Design choice.** It has no default and the server refuses to start without it. On `dev` it is 5 per pool, a development assumption (product owner, 6 Oct 2026; RR-216). Before the first deploy, the total across the directory and Organisation pools, every `app` instance and worker, and the migration and operator connections is checked against the database's connection budget; the value is then tuned from measurements. **OPEN:** the values for `kdps-test` and production, set only after measurement (product owner; RR-216).
- **Migrations** run as Railway's pre-deploy command, before the new version takes traffic. A failed migration stops the deploy, and the old version keeps running.
- **Backups.** Turn on Railway's scheduled PostgreSQL backups on `kdps-test`, and practise one restore so the steps are known before the go-live drill (`POL-18.03`). Include attachments in the rehearsal: the restored records must show their attachments and links again (`PRD-SEC-012`). Files are held in a Railway bucket (D-2, `DEC-105`); its backup steps are in the backup and restore design (GC-9). Name no frequency or retention here. The test setup makes **no recovery promise**: the `POL-18.01` targets apply to production. The earlier POS is the system of record, so losing test data loses nothing official; an exported PT file already loaded into the earlier POS is that system's record and is not lost with the test data (`DEC-053`).

## 5. Live updates (SSE)

Railway keeps an HTTP stream open for at most 15 minutes, and closes it after 5 minutes with no data. So:

- The server sends a heartbeat comment well inside the 5-minute idle limit.
- The browser reconnects automatically with `Last-Event-ID`, then refetches what changed (Stack: Live updates). An event carries identifiers only, so a reconnect loses nothing.

## 6. Devices in Stores and offices

**Baseline (D-6, `DEC-105`):** the server never calls into a Store or office. The local helper and the Tally local gateway call the server over HTTPS with a service-identity credential ([access-and-approvals.md](../access/access-and-approvals.md) 2.3). Anything else there stays on the local machine.

- **Local helper (printers, cash drawer).** It runs on any PC with a receipt or label printer attached (counter, warehouse or office). The counter PWA calls it on `localhost` on that PC. The helper calls the server over HTTPS with its service-identity credential; nothing calls into the PC.
- **Tally local gateway (stage 5).** It runs on the office PC beside TallyPrime (`PRD-INT-009`) and calls the server over HTTPS with its service-identity credential; nothing calls into the office:
  - It fetches pending vouchers from the server over HTTPS.
  - It posts them to Tally's local XML interface.
  - It reports Tally's response back.
  - Outcomes stay pending, unknown, failed or succeeded until reconciled (`PRD-INT-006`, `PRD-INT-007`).
  - File-export fallback as in `PRD-INT-009`.
- **Scanners** are keyboard input. They need nothing on the server.

## 7. What the test setup never does

These follow from `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016` and `PRD-LIF-026`. The earlier POS stays the system of record, so the test setup also never does the following, with one exception:

- Imports from the earlier POS (daily sales report, stock-on-hand) are for checking and reports only. They never create, reduce or move stock (`PRD-LIF-014`).
- An import never creates a tax invoice or a second sale for a bill the earlier POS issued (`PRD-LIF-016`).
- Bills on `kdps-test` are test bills only. No tax invoice is issued and no real customer is billed (`PRD-LIF-026`). Billing stays disabled there until its policy is signed (`DEC-071`).
- A Store is never switched over on test hosting (`PRD-LIF-026`).
- Exception: one file does leave the test setup for the earlier POS: the approved PT export in the KDPS layout (`PRD-PTW-008`). A person loads it into the earlier POS manually. There is no automatic link (`DEC-053`).

Each external adapter on `kdps-test` is either switched off or pointed at a sandbox:

| Outside system | On `kdps-test` |
| --- | --- |
| GST: IRN, e-invoice, e-way bill | A GSP sandbox or off. Never a real IRN |
| WhatsApp, SMS, email | Only to named test recipients. Never to customers |
| Bank files and payments | Off |
| Card and UPI providers | Sandbox or off. No real charge |
| Tally | Only a separate test Tally company. Never KDPS's live company. **OPEN:** whether KDPS can provide one (see 10) |

## 8. Region and speed

- Railway's regions are US West, US East, Europe West and Asia Southeast. None is in India. Use **Asia Southeast**, the nearest.
- During the side-by-side test, measure the counter barcode lookup and online bill finalisation against the PRD performance targets. Use the real Stores' connections (`PRD-PRF-001`). The results inform the production hosting choice; they are not a promise on test hosting.
- KDPS's real data sits outside India on this setup. That is why KDPS Owner question 37 asks for their agreement.

## 9. Personal data and logs

- Until KDPS answers question 37, imports keep **no customer name or phone number** from the earlier POS reports (`PRD-SEC-009`, `PRD-SEC-010`). Nothing personal is kept by default.
- Logs are pino JSON to standard output, read in Railway's log view (Stack: Diagnostics). Logs carry no secrets or unneeded personal data (`PRD-SEC-014`).
- Secrets live in each environment's Railway variables, never in the repository. Among them, `AOS_ORGANISATION_KEYS` holds the key of each Organisation that encrypts authenticator secrets and restricted values (access-and-approvals 6); the server refuses to start without it.
- File storage (stored files, [imports-and-opening-data.md](imports-and-opening-data.md) 3.1 step 2 and 11; `S1-F06-T05`) is set by six variables of `app` and `worker`: `AOS_FILE_STORE_ENDPOINT`, `AOS_FILE_STORE_REGION`, `AOS_FILE_STORE_BUCKET`, `AOS_FILE_STORE_ACCESS_KEY_ID`, `AOS_FILE_STORE_SECRET_ACCESS_KEY` and `AOS_FILE_STORE_ADDRESSING` (`path`, as MinIO needs, or `virtual`). With none set, file storage is not configured: storing or reading a file answers `unavailable` (`files-imports.file-store-not-configured`) and nothing else is affected, so a deploy without them starts. With only some set, the server refuses to start and names the missing variables, never a value. They have no defaults. On `dev` the bucket is wired to `app` only after the product owner authorises the Railway environment (RR-187). **Design choice.**

## 10. Open questions

| # | Question | Who decides | Needed by |
| --- | --- | --- | --- |
| D-1 | Production hosting | Product owner | Before the first Store switch (`PRD-LIF-026`) |
| D-2 | Baseline (`DEC-105`): a Railway bucket, S3-compatible, holds files on the test setup | — | — |
| D-3 | Baseline (`DEC-105`): `kdps-test` uses the Railway-provided address; a custom domain can be added later | — | — |
| D-4 | KDPS's agreement to hold real data on the test setup, and whether customer details are imported | KDPS Owner (question 37) | Before KDPS's side-by-side test |
| D-5 | A separate test Tally company for the connector | Accounts | Stage 5 testing |
| D-6 | Baseline (`DEC-105`): the local helper and the Tally local gateway call the server over HTTPS with a service-identity credential, and nothing calls into a Store or office. Development uses the same sign-in as production, with synthetic users, apart from the test sign-in of `local` and `dev` (DEC-121) | — | — |
| D-7 | The most connections each database pool opens (`AOS_DATABASE_POOL_MAX`, section 4); a technical setting with no default. On `dev`: 5 per pool, a development assumption, checked against the connection budget and tuned from measurements (product owner, 6 Oct 2026; RR-216). **OPEN** for `kdps-test` and production, after measurement | Product owner | The first deploy to `kdps-test` |
