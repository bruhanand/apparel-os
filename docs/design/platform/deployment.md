# Test deployment on Railway

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements: PRD "Technical platform" (Stack: Hosting, Authentication, Live updates, Jobs, Files, Hardware, Diagnostics); `PRD-MOD-001`; `PRD-ACS-017`; `PRD-INT-006`, `PRD-INT-007`, `PRD-INT-009`; `PRD-SEC-001`, `PRD-SEC-005`, `PRD-SEC-009`, `PRD-SEC-010`, `PRD-SEC-012`, `PRD-SEC-014`; `PRD-OFF-002`; `PRD-PRF-001`; `PRD-PTW-008`; `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`, `PRD-LIF-026`. Decisions: DEC-027, DEC-028, DEC-053, DEC-071, DEC-084. Policies: 2 (sessions, `POL-02.17`, `POL-02.18`), 18 (`POL-18.01`, `POL-18.03`).

**Covers test hosting only.** Production hosting is chosen before the first Store switch (`PRD-LIF-026`) and gets its own document.

---

## 1. Two environments, never mixed

One Railway project with two environments. Each has its own services, database, variables and private network.

| Environment | Data | Who uses it | Deploys |
| --- | --- | --- | --- |
| `dev` | Synthetic only, labelled as synthetic | The product owner and developers | Automatically from the main branch |
| `kdps-test` | Real KDPS data for the side-by-side test | KDPS staff, through app logins only | Only by manually promoting a commit already tested on `dev` |

- Never copy data between the two. Synthetic data never becomes a default (AGENTS rule).
- `kdps-test` holds real data only after KDPS agrees to it (KDPS Owner question 37).
- Only the product owner has access to the Railway project. KDPS users get app logins, never Railway access.
- On `kdps-test`, actions whose policy is not signed stay disabled, even with real data. Only imports and checks that need no gated action run (`DEC-071`). The app shows an environment banner.

## 2. Services in each environment

| Service | What runs | Reachable from |
| --- | --- | --- |
| `app` | NestJS server: the API under `/api`, live updates (SSE), and the built web app and counter PWA as static files | The public internet over HTTPS (one public address) |
| `worker` | The same build with a different start command: pg-boss jobs and the outbox processor | Private network only |
| `postgres` | Railway PostgreSQL. pg-boss tables live here too (Stack: Jobs) | Private network only. No public proxy on `kdps-test` |
| File storage | S3-compatible storage for documents and photos (Stack: Files) | Private network and signed links. **OPEN:** provider (see 10) |
| `forecast` | Python forecasting service. Added in stage 6. **Proposed:** the PRD's Hosting row does not yet name it (OPEN: product owner, before stage 6) | Private network only |

Services talk to each other over Railway's private network (`*.railway.internal`), which is scoped to one environment. So `dev` can never reach `kdps-test`.

## 3. One address for the browser

The `app` service serves the API, the web app and the counter PWA from **one origin**. For example, `/` is the web app, `/counter/` is the counter PWA and `/api/` is the API.

Why one origin:

- Sessions are PostgreSQL-backed server sessions in a cookie (`PRD-SEC-001`; Stack: Authentication). With one origin, the cookie is first-party. It needs no cross-site settings, which browsers increasingly block, and no CORS.
- Cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, host-only (no `Domain` attribute), path `/`.
- The PWA service worker and IndexedDB belong to the same origin as the API that registers the device (`PRD-OFF-002`).
- The cost: web, counter and server deploy together. That is acceptable for testing, since they share one repository.

A custom domain is optional. The Railway-provided address works for testing. **OPEN:** whether `kdps-test` gets a custom domain (see 10).

Idle and absolute session limits come from policy 2 (`POL-02.18`); production and `kdps-test` require TOTP (`PRD-SEC-001`, `POL-02.17`). Development test access stays apart from production login (`PRD-ACS-017`). Hosting changes none of this.

## 4. Database

- **One database per Organisation** (`PRD-MOD-001`).
  - `kdps-test`: one database for KDPS.
  - `dev`: at least two synthetic Organisations, so tests prove one cannot see the other.
- **Two database roles:**
  - A *migration role* owns the tables and runs reviewed SQL migrations (Stack: Database access).
  - A *runtime role* is used by `app` and `worker`. It neither owns the tables nor bypasses row-level security, so PostgreSQL scope controls always apply (`PRD-SEC-005`).
- **Migrations** run as Railway's pre-deploy command, before the new version takes traffic. A failed migration stops the deploy, and the old version keeps running.
- **Backups.** Turn on Railway's scheduled PostgreSQL backups on `kdps-test`, and practise one restore so the steps are known before the go-live drill (`POL-18.03`). Include attachments in the rehearsal: the restored records must show their attachments and links again (`PRD-SEC-012`). How file storage is backed up depends on the provider chosen in D-2 (OPEN: product owner, stage 1 build); name no frequency or retention here. The test setup makes **no recovery promise**: the `POL-18.01` targets apply to production. The earlier POS is the system of record, so losing test data loses nothing official; an exported PT file already loaded into the earlier POS is that system's record and is not lost with the test data (`DEC-053`).

## 5. Live updates (SSE)

Railway keeps an HTTP stream open for at most 15 minutes, and closes it after 5 minutes with no data. So:

- The server sends a heartbeat comment well inside the 5-minute idle limit.
- The browser reconnects automatically with `Last-Event-ID`, then refetches what changed (Stack: Live updates). An event carries identifiers only, so a reconnect loses nothing.

## 6. Devices in Stores and offices

**Proposal, not decided (D-6, product owner):** the server does not connect into a Store or office; devices there connect outwards or stay on the local machine.

- **Local helper (printers, cash drawer).** It runs on any PC with a receipt or label printer attached (counter, warehouse or office). The counter PWA calls it on `localhost` on that PC. How the helper and the Tally local gateway reach the server is **OPEN** (see D-6; product owner).
- **Proposed: Tally local gateway (stage 5).** It runs on the office PC beside TallyPrime (`PRD-INT-009`):
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
- Secrets live in each environment's Railway variables, never in the repository.

## 10. Open questions

| # | Question | Who decides | Needed by |
| --- | --- | --- | --- |
| D-1 | Production hosting | Product owner | Before the first Store switch (`PRD-LIF-026`) |
| D-2 | File storage provider for the test setup. A Railway bucket is one S3-compatible option; DEC-028 does not cover file storage | Product owner | Stage 1 build |
| D-3 | A custom domain for `kdps-test`, or the Railway-provided address | Product owner | Before KDPS's side-by-side test |
| D-4 | KDPS's agreement to hold real data on the test setup, and whether customer details are imported | KDPS Owner (question 37) | Before KDPS's side-by-side test |
| D-5 | A separate test Tally company for the connector | Accounts | Stage 5 testing |
| D-6 | How the local helper and the Tally local gateway reach the server; whether development may use an easier login path | Product owner; Admin validates login (V-04) | Helper and Tally gateway: not yet named (product owner). Login path: before KDPS's side-by-side test |
