# Offline counter

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

> **Partly approved.** Sections 3 to 5 and 11 were approved by the product owner on 6 Oct 2026, with RR-015, GC8-7 and GC8-8 (DEC-116); a choice they mark **Proposed** is agreed. Sections 6 to 10 remain **Draft**: every engineering choice there is **Proposed** until the product owner approves it, and their remaining decisions are due before the stage 1 exit gate.

Status: sections 3 to 5 and 11 approved, 6 Oct 2026; sections 6 to 10 **Draft**. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Offline counter; from Counter sales and payments, the billing device and its bill series; from AI, security and operational reliability, the revocation of lost devices and the bounded expiry of offline delegation; from Opening, closure, migration and export, the devices readiness check; from Technical platform, the counter row of the Stack. It details the `pos` billing-device part of [module-map.md](../architecture/module-map.md) 4.17 and the offline records of [domain-model.md](../architecture/domain-model.md) 3.12, and is GC-8 in [gaps-before-code.md](../../history/gaps-before-code.md). It also answers readiness items RR-014, RR-015 and, for the devices check, RR-016 of the [open items](../../plan/open-items.md).

- PRD IDs: `PRD-OFF-001`–`PRD-OFF-019`; `PRD-POS-005`, `PRD-POS-012`–`PRD-POS-016`, `PRD-POS-019`, `PRD-POS-020`; `PRD-RET-016`, `PRD-RET-020`; `PRD-SEC-001`, `PRD-SEC-005`–`PRD-SEC-008`, `PRD-SEC-013`–`PRD-SEC-017`; `PRD-ACS-008`, `PRD-ACS-013`, `PRD-ACS-017`; `PRD-INT-001`–`PRD-INT-004`, `PRD-INT-006`; `PRD-MOD-002`, `PRD-MOD-007`–`PRD-MOD-011`; `PRD-ORG-005`; `PRD-STK-003`; `PRD-LIF-001`, `PRD-LIF-002`, `PRD-LIF-015`; `PRD-UXP-003`; `PRD-PRF-001`, `PRD-PRF-003`; `PRD-ACP-011`, `PRD-ACP-018`.
- Policies: 2 (`POL-02.03`, `POL-02.07`, `POL-02.16`, `POL-02.18`), 10 (`POL-10.07`), 16 (`POL-16.01`–`POL-16.07`).
- Decisions: DEC-005, DEC-051, DEC-062, DEC-064, DEC-071, DEC-077, DEC-082, DEC-092, DEC-105, DEC-112, DEC-116.

Depends on: [module-map.md](../architecture/module-map.md) (4.3, 4.6, 4.16, 4.17: owners and operations), [domain-model.md](../architecture/domain-model.md) (3.2, 3.5, 3.12: device, series, working set), [access-and-approvals.md](../access/access-and-approvals.md) (2.4 devices, 3.3 sessions, 7.1 the order of checks), [numbering-and-audit.md](../platform/numbering-and-audit.md) (3: series, their states and interface), [stock-ledger.md](../stock/stock-ledger.md) (6.1 the offline protected quantity, 10.1 idempotency, 10.3 lock order, 10.5 offline bills that do not fit), [shared-calculations.md](../calculations/shared-calculations.md) (2.1, 2.3, 12.2: the counter's calculations and the counter run), [deployment.md](../platform/deployment.md) (3: one origin, `/counter/`), [structure-and-masters.md](../masters/structure-and-masters.md) (3.3, 3.4: Stores, business units and their mappings), [code-house-rules.md](../platform/code-house-rules.md) (2, 9, 10).

Used by: `S1-F12` (billing devices and device bill series), the counter run of `S1-F11`, the devices check that `S1-F12` adds to `S1-F04`, `S4-F11` (the offline counter) and the stage 4 counter design.

---

## 1. What this document fixes

- What a billing device is, how it is registered online, how it proves it is the device it claims to be, and how it is revoked, retired and replaced (`PRD-OFF-002`, `PRD-OFF-010`, `PRD-SEC-008`).
- The device bill series: one per device, tax registration and financial year, who writes it, and what happens to it at revocation, replacement, pause and a year boundary (`PRD-POS-020`, `PRD-OFF-002`, `PRD-OFF-012`).
- Where the counter app lives in the workspace, how it is served, and how its golden-case test page is reached in CI (RR-015; `PRD-ACP-018`).
- The offline counter: its designation and offline authority, the working set, what the counter never holds, the local commit, upload and reconciliation, pause and release, and clock and device trouble (`PRD-OFF-001`, `PRD-OFF-003`–`PRD-OFF-019`).
- The devices readiness check (`PRD-LIF-002`; RR-016).
- What stage 1 builds, and the tests that prove it (section 13 and section 14).

It fixes no offline limit, duration, amount, tender list, Store, counter, financial-year date or number format. Those are KDPS's, Accounts' or the CA's and stay OPEN (section 15). Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says. A **Proposed** in sections 3 to 5 and 11 is approved (product owner, 6 Oct 2026); every other **Proposed** waits for the product owner's approval.

## 2. Where the counter sits

### 2.1 Owners

The ownership split is module-map 4.17's. This document adds no module and moves no record.

| Concern | Owner | IDs |
| --- | --- | --- |
| Device identity, its key, its state, its sessions | `access` | `PRD-SEC-008`, `PRD-OFF-010`; access-and-approvals 2.4 |
| Billing-device facts: its Store, the business units it bills for, the offline counter designation, offline authority, the working set, uploads, the billing pause, the reconciliation queue | `pos` | `PRD-OFF-001`–`PRD-OFF-005`, `PRD-OFF-009`, `PRD-OFF-011` |
| The bill series and the numbers recorded in them | `numbering` | `PRD-POS-020`, `PRD-OFF-002`; numbering-and-audit 3.4 |
| The offline protected quantity | `stock` · ledger | `PRD-OFF-006`; stock-ledger 6.1 |
| Prices, offers, tax and rounding on the counter | `calculations`, run in the counter | `PRD-MOD-007`; shared-calculations 2.2 |
| Whether offline operation is available | `configuration` (the policy gate) | `PRD-SEC-017`; policy 16 |

`pos` calls `access`, `numbering`, `stock`, `organisation`, `configuration`, `exceptions`, `audit` and `kernel`, all downward (module-map section 3). `site-lifecycle` asks `pos` for the devices check (section 11).

### 2.2 Online tills and the offline counter

- Every billing device has its own bill series per tax registration and financial year, online or offline (`PRD-POS-020`, DEC-005).
- An **online till** bills only with a connection. The server gives each of its bill numbers inside the bill's transaction (numbering-and-audit 3.2), and an online till cannot finalise a bill without a connection ([design-language.md](../ui/design-language.md) section 6, the till shell).
- The **offline counter** is the one billing device of a Store designated to bill without a connection (`PRD-OFF-001`, `POL-16.01`). It is a billing device first: it is registered, proved and numbered like any other, and holds offline authority as well (6.1).
- Offline billing is designed in stage 1 and enabled only under the signed Offline operation policy, policy 16 (AGENTS.md "Delivery", DEC-051). Its build is `S4-F11`. On `kdps-test`, billing stays disabled until its policy is signed (DEC-071).

## 3. Billing devices

### 3.1 The record

- A billing device is a registered device that issues bills and holds its own bill series (PRD "Words used"; `PRD-OFF-002`).
- `access` keeps the device: its code, unique in the Organisation (access-and-approvals 2.4), its public key once enrolled (3.2), and its state. `pos` keeps, for the same identifier: its Store, fixed for life, and the business units of that Store it bills for, as a dated list. **Proposed.**
- Its tax registrations are not chosen separately. They are those of its business units' mappings in force on the date (`PRD-ORG-005`; [structure-and-masters.md](../masters/structure-and-masters.md) 3.4). A device billing for two units mapped to two registrations holds two series (DEC-005, DEC-077). **Proposed:** recording units, not registrations, because every bill belongs to one business unit, and through it to one registration and one book (`PRD-ORG-005`); two units may share a registration and differ in book.
- Only whole-store and brand-counter units of the device's own Store can be listed ([structure-and-masters.md](../masters/structure-and-masters.md) 3.3). **Design choice.**
- States: Setting up (registered, not yet enrolled), Active, Ended (retired after use, not lost) and Revoked (reported lost, `DEC-092`). Revoked and Ended are final; a replacement is a new device (access-and-approvals 2.4). Setting up, Active and Ended are names already in the settled list of [design-language.md](../ui/design-language.md) section 7, used here for a new record. The four names were approved by the product owner on 6 Oct 2026 (GC8-7, DEC-116).

### 3.2 Registration and enrolment

Registration is online and needs the permission to register devices, given only through a role assignment (`POL-02.03`, `PRD-INT-001`). The Admin template's Setup work includes devices, but a template grants nothing by itself, and the first Admin of the setup step does not hold it ([access-and-approvals.md](../access/access-and-approvals.md) 9.11). No independent approval: device registration is not among the independently approved actions of `POL-02.07`, and this design adds none.

1. **Register.** In Setup › Devices, tills and bill series of the back office, an authorised person creates the device: code, label, Store and business units. It is Setting up. **Proposed.**
2. **Enrol.** On the physical device, in Chrome or Edge (PRD Stack: Counter), an authorised person signs in at `/counter/` and chooses "enrol this browser" for that device. The page generates a key pair in the browser with WebCrypto, ECDSA on curve P-256, with the private key marked non-extractable, and keeps the private key in the counter's IndexedDB (5.3). It sends the public key and a signature over a one-time server challenge. **Proposed.**
3. The server checks the challenge and the signature, binds the public key to the device, and makes the device Active, all in one transaction with its audit record and an access record (`PRD-ACS-013`, `PRD-SEC-007`, `PRD-INT-004`). In the same transaction `pos` defines the device's series, where their format and financial-year dates exist (4.1).

- A device is enrolled once. Its key never changes; a new key is a new device (3.5). A second enrolment of the same device is refused. **Proposed.**
- Enrolment is a protected action that asks for a fresh authenticator code ([access-and-approvals.md](../access/access-and-approvals.md) 3.3), one more action on the GC3-6 list. Approved by the product owner on 6 Oct 2026 (GC8-8, DEC-116).
- A browser profile holds at most one enrolled device identity per Organisation. Enrolling a second one in the same profile is refused while the first still holds a bill not yet uploaded or a protected quantity (6.6). **Proposed.**

### 3.3 Proving the device

- The device proves itself by signing a fresh server challenge with its private key. The private key never leaves the browser and no script can read it, since it is non-extractable. **Proposed.**
- Proof is asked for at sign-in on the device (3.4) and on every request only a billing device makes: offline-authority renewal, bill upload, pause confirmation and resume (sections 6, 8 and 9). Ordinary online requests rely on the session, which is fixed to its device (access-and-approvals 13.1). **Proposed.**
- A non-extractable key still lives in the browser profile, so copying the profile could copy it. A cloned or restored device must not continue the identity (`PRD-OFF-010`). Three guards do this. **Proposed:**
  - **Renewal chain.** Each offline-authority renewal gives the counter a new random renewal token, which the next renewal must present, signed. The server keeps only the hash of the current token. A stale token (a restored copy) or a second use of one token (a clone) is refused, the device's authority is not renewed again, and an exception is raised (6.2).
  - **Number collision.** A clone that bills offline issues numbers the original also issues. The same number with different content is a conflict, kept and never discarded (`PRD-OFF-009`, `PRD-INT-002`; 8.3), and stops renewal the same way.
  - **Bounded expiry.** A clone that is never caught by either can bill only until its offline authority expires (`PRD-OFF-003`, `PRD-SEC-008`).
- Revocation remains a person's act (3.5). The guards stop renewal at once; they do not revoke by themselves. **Proposed.**

### 3.4 Sessions on a device

- A user signs in on a device with the Organisation code, login, password and authenticator code, as everywhere (`PRD-SEC-001`; access-and-approvals 3.1). The counter adds the device proof. With a valid proof the session is a shared POS session bound to that device; without one it is an office session (access-and-approvals 3.3, `POL-02.18`).
- The idle-lock and absolute limits of a shared POS session apply (`PRD-ACS-017`, `POL-02.18`). On production they apply once policy 2 is Signed and validated; tests use labelled synthetic values (access-and-approvals 3.3).
- Offline, the counter keeps applying them on its own (6.5).

### 3.5 Revocation, retirement and replacement

| Event | What happens | IDs |
| --- | --- | --- |
| **Revoke** (lost device) | `pos` calls `access` to make the device Revoked, which ends its sessions at their next request. In the same transaction it closes an online till's series, since an online till holds no local numbers, and pauses an offline counter's, which close once its queue is reconciled (section 9). The device's offline authority is not renewed again; delegation already given ends at its bounded expiry | `PRD-SEC-008`, `PRD-OFF-003`, `PRD-OFF-010`, `DEC-092` |
| **Retire** (device taken out of use, not lost) | An online till: its series close and its sessions end at once; the device is Ended. An offline counter: first the billing pause, queue reconciliation and release of section 9; then its series close and it is Ended | `PRD-OFF-010`, `PRD-OFF-011` |
| **Replace** | The old device is retired or revoked as above. The replacement is a new device with a new code, enrolled with a new key, and gets fresh series. A closed series is never continued | `PRD-OFF-010`, `PRD-LIF-015`; numbering-and-audit 3.4 |

- The designation as the Store's offline counter moves to a replacement only after the old device's queue is reconciled (`PRD-OFF-010`; 6.1).
- Revoking calls the access operation Register or revoke a device (module-map 4.3), so the event `access.device-revoked` is published for other consumers; `pos` makes its own changes in the same transaction rather than waiting for the event. **Design choice.**
- Releasing the protected quantity of a lost offline counter, which can never confirm its own pause, is OPEN (GC8-1).

## 4. Device bill series

### 4.1 One series per device, registration and financial year

- `pos` defines the series through `numbering`. The scope key stands for the device and the tax registration (numbering-and-audit 3.4; module-map section 3, rule 6). Each series restarts each financial year.
- A device gets one series for each registration of its units, for the current financial year, when it is enrolled; and for each new registration when a unit's mapping changes (4.3). A second open or paused series for the same device, registration and year is refused by `numbering`, so two live devices never share one (`PRD-POS-020`, `PRD-OFF-002`; numbering-and-audit 3.7).
- A series needs a format. The bill-number format is set per Organisation within the statutory limit, and the CA confirms it for each registration (`PRD-POS-020`, `POL-10.07`). It is OPEN (V-40, RR-101). Until it is confirmed no live series can be defined, and the devices check fails with that reason (section 11). Tests use labelled synthetic formats.
- A series needs the financial year's dates. They are an Organisation setting with no default (GC5-1, RR-060). Until they are set, defining a series is refused with that reason.
- Enrolment waits for neither. With no confirmed format or no financial-year dates, enrolment succeeds and defines no series, and the devices check fails naming what is missing (section 11; test 8). Product owner, 6 Oct 2026 (DEC-116).
- When an approved change later defines the bill format or the financial-year dates, the same change creates the missing series for every Active device that has none. It is retry-safe: a repeat creates nothing twice, and it never replaces, renumbers or resets an existing series (product owner, 6 Oct 2026, `DEC-117`).

### 4.2 Who writes the series

- An **online till**'s series is written only by the server: Allocate, inside the bill's transaction (numbering-and-audit 3.2).
- The **offline counter**'s series is written only by the counter: it advances the sequence in the same local transaction as the bill (`PRD-OFF-007`; 7.3), whether it is online or offline at the time. On upload, `pos` records the numbers it used through Record used numbers (numbering-and-audit 3.7). **Proposed:** one writer per series. If the server also gave numbers from the counter's series while it was online, a connection that drops mid-request would leave the counter not knowing whether its last number was used.
- So the offline counter commits every bill locally first, and uploads it at once when online (section 8). A step that needs online authority, such as a provider-confirmed card payment or a Store-credit redemption, is taken online before the local commit and bound to that bill (`PRD-OFF-016`; GC8-6).
- Record used numbers also records a number on a paused series: a used number is a fact (`PRD-OFF-014`). On a closed series it is refused, and the bill goes to the reconciliation queue (8.3). **Design choice.**

### 4.3 Financial year and mapping changes

- Each year's series is defined before the year starts (numbering-and-audit 3.3), for every Active device and every registration of its units. The offline counter receives its next year's series while online, in its authority (6.2).
- A bill takes the series of the financial year its business date falls in (10.2). If the counter does not hold that year's series, finalisation is blocked until it renews online (`PRD-OFF-018`). **Design choice.**
- When a unit's mapping changes to another registration from a date, `pos` defines the device's series for the new registration before that date, on the event `organisation.mapping-changed`. A mapping version never starts on a past date ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2), so the series can always be defined in time. **Design choice.**

### 4.4 Series states

| Device event | Series state | IDs |
| --- | --- | --- |
| Enrolled | Open | `PRD-POS-020` |
| Billing pause (offline counter) | Paused, at the pause point of 9.1 | `PRD-OFF-011`, `PRD-OFF-012` |
| Resume | Open | `PRD-OFF-013` |
| Revoked | Online till: Closed. Offline counter: Paused, then Closed after its queue is reconciled | `PRD-SEC-008`, `PRD-OFF-010` |
| Retired, or replaced | Closed, after its queue is reconciled where it has one | `PRD-OFF-010`, `PRD-LIF-015` |
| A Store's switch | Fresh series for each device (`PRD-LIF-015`); the switch design is stage 4 | `PRD-LIF-015` |

The state names are Open, Paused and Closed (DEC-105, DM-4). Closed is final.

## 5. The counter app

This section answers RR-015. The product owner approved it on 6 Oct 2026: the counter app is `apps/counter`, served at `/counter/`, with its browser tests in `apps/counter/e2e/`.

### 5.1 The package `apps/counter`

- A new workspace package, `apps/counter` (`@apparel-os/counter`): a React app built with Vite, like `apps/web` (PRD Stack: Web, Counter; `PRD-MOD-007`). **Proposed.**
- Why a package of its own, not a route of `apps/web`:
  - its bundle must provably exclude the costing entry point (shared-calculations 2.1) and every back-office screen that shows cost or margin (`PRD-OFF-004`, `PRD-ACS-008`); a separate build makes that a property of the build, not of routing;
  - its service worker, precache and IndexedDB database serve only the counter;
  - it installs as its own PWA.
- It imports only packages: `@apparel-os/domain`, `@apparel-os/schemas`, the selling entry point of `@apparel-os/calculations`, and `@apparel-os/ui`; its golden-case page also bundles the golden runner of `packages/calculations` (5.5). It never imports `apps/server` or `apps/web` (`PRD-MOD-002`). The module check gains that rule when the package is created (`PRD-SEC-015`).
- Dependencies come only from the Stack's Counter row: Dexie for IndexedDB, and Workbox for the service worker (code-house-rules 10.6). A wrapper plugin that is not itself in the Stack is not added. **Proposed.**

### 5.2 Served at `/counter/`

- The build uses the base path `/counter/`. The `app` service serves `apps/counter/dist` at `/counter/`, beside the web app at `/` and the API at `/api/`, from one origin, so the session cookie is first-party and the service worker and IndexedDB belong to the origin that registers the device (deployment.md section 3; `PRD-OFF-002`).
- The service worker's scope is `/counter/`. Requests to `/api/` from the counter are network-only: never cached and never answered from the precache. **Proposed.**
- The golden-case page (5.5) is not served by the deployed `app` service. **Proposed.**

### 5.3 Inside the browser

- **One database per device identity**, in IndexedDB through Dexie, named by the Organisation code and the device identifier. Its stores hold: the device key; the offline authority and its versions; the working set; the local protected quantity; the series cursors; recoverable carts; finalised bills; pending-sync records; sync results; the billing pause; the clock record; and the unlock verifiers of 6.5. **Proposed.**
- **One writer.** Only the tab that holds the device's Web Lock may finalise, commit, upload or pause (10.3). The service worker caches the app shell and never writes billing data. **Proposed.**
- **Workbox** precaches the counter's own files, so the counter starts with no connection. A new version waits until it is safe to switch (10.3). **Proposed.**
- Bills are immutable once committed: the counter's data layer has no operation that changes or deletes a finalised bill. Sync results are kept apart from the bill (`PRD-OFF-008`, `PRD-MOD-011`). **Proposed.**
- Dexie schema versions only add stores and fields. No upgrade drops or rewrites the stores of bills, pending-sync records or series cursors (`PRD-OFF-019`). **Proposed.**

### 5.4 The shared calculations in the counter

What the counter bundle includes and excludes follows shared-calculations 2.1 and 2.3.

| Included | Excluded |
| --- | --- |
| The selling entry point of `@apparel-os/calculations`: price a bill, list applicable offers, check tenders (shared-calculations 11) | The costing entry point: cost a line, ticket margin. It never ships in the counter (`PRD-OFF-004`) |
| `@apparel-os/domain`: paise, Unknown, identifiers | Return value, exchange difference and split refund are in the selling entry point, but the counter never offers a return or refund offline (`PRD-OFF-015`). Online, returns go through the server |

- **Build guard.** A Vite plugin in `apps/counter` fails the build when any module of the costing entry point enters the module graph (or when it cannot resolve that entry point), and writes the list of bundled modules, with the costing folder it checked, for a test to check. One predicate, `isCostingModule`, serves the plugin, its unit test and the Playwright run. That is the "build check" of shared-calculations 2.1. **Proposed.**
- The counter prices a cart with the versions in its working set and records them on the bill; the server prices it again on upload with the same versions (shared-calculations 2.2; `PRD-OFF-005`).

### 5.5 The golden-case test page and Playwright in CI

- **The page.** `apps/counter` has a second HTML entry, `golden/index.html`, in the same Vite build as the counter. Both entries import the selling entry point, so Rollup places it in one shared chunk, and the page runs exactly the code the counter runs (shared-calculations 12.2). The golden runner that the server suite uses, `packages/calculations/test/golden-runner.ts`, is bundled into the page and given only the selling entry point, so costing cases are reported as server-only (shared-calculations 12.2). The page holds no case and no data. It exposes one function that takes a case and returns the runner's outcome. Approved by the product owner on 6 Oct 2026 (RR-015).
- **The run.** A Playwright test in `apps/counter/e2e/` starts `vite preview` of the built counter on a fixed local port, opens `/counter/golden/` in Chromium (Chrome and Edge both run on Chromium; PRD Stack: Counter), reads every case file in `packages/calculations/golden/` in Node and passes each to the page. The runner compares the whole result, versions included, with `expected` or `refusal`. Each case is its own test, so a failed or throwing case never hides the cases after it. The run fails on any case the runner reports as failed, and when the number of outcomes differs from the number of case files; a deliberately wrong case, fed to the page apart from the real run, proves a failure is reported as failed (S1-F11-AT06). **Proposed.**
- **The bundle check.** The same test reads the module list the build guard wrote and fails if any costing module is in it.
- **CI.** The code-check workflow installs the Playwright Chromium build, runs `pnpm build`, then the counter run, on every push and pull request (code-house-rules 10.5; `PRD-SEC-016`). Turborepo builds `packages/calculations` before `apps/counter`. The root script `pnpm test:counter` builds, then runs the Playwright test; it is in `AGENTS.md` "Code workspace". The counter has no React yet: React arrives with the first counter screen, after this build. **Proposed.**
- The stage 1 exit check passes only when both the server run and this counter run pass (`PRD-ACP-018`; shared-calculations 12.2).
- Browser journeys sit in `apps/web/e2e/` ([code-house-rules.md](../platform/code-house-rules.md) section 2). The counter run is not a journey; it sits in `apps/counter/e2e/`, as the product owner approved on 6 Oct 2026, and code-house-rules sections 2 and 10.1 are amended to say so.

## 6. Offline authority and the working set

Everything in this section is built in `S4-F11` and enabled only under signed policy 16 with its real values validated (DM-6, DEC-105; `PRD-SEC-017`).

### 6.1 Designation

- A Store may have at most one offline counter at a time, and only if it is approved for offline billing (`PRD-OFF-001`, `POL-16.01`). The designation is a dated `pos` record naming the Store and one Active billing device of that Store; two designations of one Store never overlap. **Design choice.**
- Which Stores are approved and which counter each uses are policy 16 values, OPEN (V-36, RR-097). They are recorded as policy 16's real values and validated by a person who did not enter them (DM-6, DEC-105).
- No Store needs an offline counter. Online tills work without one.

### 6.2 Renewal

- Offline authority is the time-limited right of a Store's one registered offline counter to finalise bills without a connection, renewed online every 24 hours (PRD "Words used"; `PRD-OFF-003`, `POL-16.01`).
- The counter asks for renewal each time it reconnects and after each upload batch, so a counter that is online keeps a fresh authority without any timer value. **Proposed.**
- The server renews only when all of these hold, under the locks of the device and designation rows (stock-ledger 10.3, step 0): the device is Active and designated; the device proof and the renewal token are valid (3.3); the operation is available (policy 16 Signed, values validated, capability on, the Store's selling activity granted; `PRD-SEC-017`, `PRD-LIF-001`); the device is not paused (section 9); its clock is within tolerance (10.1); and no clone or restore conflict is open for it (3.3).
- A renewal is a new authority version. It holds: valid from now for 24 hours (`PRD-OFF-003`); the device's units, registrations and series, with the next financial year's where defined (4.3); the working-set version (6.3); the users who may act offline (6.5); the tenders permitted offline (6.3); and the new renewal token. **Proposed.**
- Every bill records its authority version and working-set version (`PRD-OFF-005`).
- Expiry stops new finalisation and nothing else: carts, finalised bills, uploads and the protected quantity stay as they are (`PRD-OFF-003`). The till shows Authority expired ([design-language.md](../ui/design-language.md) section 6, the till shell).

### 6.3 The working set

The working set holds what shared-calculations 2.3 lists, for the counter's Store only (`PRD-OFF-004`, `POL-16.04`):

- the identities and aliases of eligible goods, and each SKU's MRP groups at the Store, with the protected quantity per MRP group (6.6), and for piece-tracked goods the protected piece IDs;
- price lists, offers and combination rules in force for the Store, without cost shares;
- tax rules, the price basis setting and rounding rules in force for the Store's registrations;
- the version of each.

It also holds two things the bill needs that are not pricing: the tenders permitted offline under policy 16 (`PRD-OFF-017`, `POL-16.02`; which ones is OPEN, V-36, V-37, DEC-082), and which bills need a tax document before issue, so the counter can block them (`PRD-OFF-018`, `POL-16.06`; e-invoice applicability is OPEN, V-41). **Proposed.**

- It has a validity time, a policy 16 value with no default (`POL-16.07`, DEC-064; OPEN, V-66, RR-125). Past it, finalisation is blocked as Working set expired (`PRD-OFF-004`, DEC-062). Until the value is configured, no working set is issued and offline billing stays unavailable (`PRD-SEC-017`).
- A refresh replaces the working set as a whole, as a new version. The counter keeps the version each open cart was priced with; a cart is priced again with the new version before it is finalised (`PRD-POS-013`). **Proposed.**
- It holds no customer record. Finding a customer needs a connection. What customer details an offline bill may capture, and how, is the stage 4 counter design's, with consent and notices (`PRD-POS-012`; module-map MM-15).

### 6.4 What the counter never holds

| Never on the counter | Why |
| --- | --- |
| Cost, BASIC, P RATE, cost layers and pools; margin; receipt-origin value; offer cost shares | `PRD-OFF-004`; shared-calculations 2.3 |
| The costing entry point of the calculations | shared-calculations 2.1; 5.4 |
| Bank details, identity documents, salary and other restricted fields | `PRD-ACS-008`, `PRD-SEC-006` |
| Another Store's working set or protected quantity | `PRD-SEC-005` |
| A password, an authenticator secret, or the session identifier in readable storage: the cookie is `HttpOnly` | `PRD-SEC-001`, `PRD-SEC-014`; deployment.md section 3 |
| The device's private key in any readable form | 3.3 |

A test reads every store of the counter's IndexedDB and every response the counter receives, and fails on any of these (section 14).

### 6.5 Who may act offline

- A bill records its operator (`PRD-POS-014`). Offline, the counter cannot ask the server who is signed in.
- **Proposed:** only a user who signed in online on this device during the current authority period, and who holds a role assignment that lets them bill at the Store, may act offline. The authority lists them (6.2). Their shared POS session goes on locally under its idle-lock and absolute limits (`POL-02.18`), measured on the device clock (10.1).
- To unlock after an idle lock while offline, the counter checks the user's password against a local verifier it derived at that user's online sign-in, with Argon2 (PRD Stack: Authentication). The verifier is kept only until the session's absolute limit or the authority's expiry, whichever is first. The authenticator secret is never kept on the device. **Proposed.**
- A user who has not signed in online on this device in the authority period cannot start offline. Whether that is acceptable to KDPS is OPEN (GC8-4).
- A user disabled after the renewal can still act until the authority expires: offline delegation has a bounded expiry, not instant revocation (`PRD-SEC-008`). The upload records that the bill was made under delegated authority (8.2).

### 6.6 Protected quantity

- The counter sells only from its protected quantity: stock reserved for it centrally, which no central sale, reservation or dispatch can take until it is reconciled and explicitly released (`PRD-OFF-006`; stock-ledger 6.1 and 6.3).
- An authorised person allocates it online, as a stock reservation of the kind "Offline protected quantity". It never exceeds the stock that is covered, accepted, good and not held (stock-ledger 6.2), nor the Store's allocation limit, which is a policy 16 value with no default (`POL-16.04`; OPEN, V-36, RR-097).
- An allocation can be increased at any time; the counter learns of it at its next renewal. Any decrease is a release, and only follows section 9 (`PRD-OFF-011`).
- The counter keeps its own local balance per SKU and MRP group, and its protected piece IDs, and reduces them in the commit transaction (7.3). It never finalises a line its local balance does not cover (`PRD-OFF-018`).

## 7. Committing a bill on the counter

### 7.1 The recoverable cart

- Each change to a cart is written to IndexedDB at once, in its own small transaction, so a cart survives a reload, a crash or a power loss (`PRD-OFF-008`). Held carts are kept the same way (`PRD-POS-013`). **Proposed.**

### 7.2 Checks before finalisation

Offline, finalisation is blocked, with the reason shown (`PRD-UXP-003`), when:

| Block | IDs |
| --- | --- |
| Offline authority has expired | `PRD-OFF-003`, `PRD-OFF-018` |
| The working set has passed its validity time | `PRD-OFF-004`, `POL-16.07`, DEC-062 |
| An item is not in the working set, or the quantity, MRP group or piece is not covered by the local protected quantity | `PRD-OFF-018`, `POL-16.04` |
| A tender is not permitted offline, or the bill uses Store credit, a Gift voucher, Customer credit, loyalty redemption, or anything else needing online authority or a fresh approval | `PRD-OFF-016`, `PRD-OFF-017`, `POL-16.03`, DEC-082, DEC-062 |
| A return, exchange or refund | `PRD-OFF-015`, `POL-16.03` |
| The bill needs a tax document before it can be issued | `PRD-OFF-018`, `PRD-POS-019`, `POL-16.06` |
| The billing pause is on | `PRD-OFF-011`, `PRD-OFF-013` |
| No series for the bill's registration and financial year | 4.3 |
| Clock trouble, a second tab, full storage or a pending upgrade | `PRD-OFF-019`; 10.1, 10.3 |

The calculation itself refuses on any Unknown input (shared-calculations 3.4).

### 7.3 The one IndexedDB transaction

Before the counter shows success or prints, one IndexedDB read-write transaction commits, or none of it does (`PRD-OFF-007`):

1. the bill, immutable: its lines, prices, discounts, taxes, tender allocation, business date, operator, salesperson per line, the calculation-policy snapshot, the authority version and the working-set version (`PRD-POS-014`, `PRD-OFF-005`);
2. the series cursor advanced by one, for the bill's registration and financial year;
3. the local protected quantity reduced;
4. a pending-sync record for the bill;
5. the cart marked finalised, pointing to the bill;
6. the clock record of 10.1.

- **Proposed:** the transaction asks for strict durability, so the commit is on disk before it completes; the tests of section 14 prove it by killing the browser right after success. If it aborts, for any reason including full storage, nothing is written, the cart stays as it was, and the counter says why.
- The target for this is under 300 ms (PRD Performance: offline durable bill finalisation; `PRD-PRF-001`).

### 7.4 After the commit

- Printing goes through the local helper on the same PC ([deployment.md](../platform/deployment.md) section 6). A failed print creates no second bill; a reprint uses the same bill and number (`PRD-POS-016`).
- Bill search includes local bills not yet uploaded, without listing them twice after upload: a bill is found by its device, registration, financial year and number (`PRD-POS-015`).

## 8. Upload and reconciliation

### 8.1 Upload

- The writer tab uploads pending bills automatically whenever the server answers, in sequence order within each series (`PRD-OFF-009`). "Online" means an authenticated request succeeded, not what the browser reports. **Proposed.**
- Each upload is signed by the device (3.3) and carries the idempotency key of stock-ledger 10.1: the device, registration, financial year and bill number, with a hash of the bill's content (`PRD-INT-002`). An upload needs no signed-in user: it is the device's, and the bill names its operator. **Proposed**; how this principal fits the order of checks in access-and-approvals 7.1 is GC8-9.
- The counter marks a bill uploaded only on the server's answer, and keeps that answer beside the bill. A lost answer means the bill is sent again; the server returns its first answer (`PRD-INT-002`).

### 8.2 What the server does

In one transaction, under the lock order of stock-ledger 10.3 (`PRD-INT-003`, `PRD-INT-004`):

1. Check the device proof, and that the bill's authority version belonged to this device and was valid at the bill's event time, and that its operator was listed in it (`PRD-INT-001`, `PRD-OFF-005`).
2. Price the bill again with its recorded versions (shared-calculations 2.2).
3. Record its number in the series (4.2), post its sale from the protected quantity (stock-ledger 10.5), its journals, its audit record and its outbox rows.

If every check passes the bill is accepted. If not, it goes to the reconciliation queue with its reason (8.3). A bill is never changed or discarded on upload (`PRD-OFF-009`, `PRD-OFF-014`).

### 8.3 The reconciliation queue

A bill goes to the visible reconciliation queue, shown on the counter and in the back office as Refused or Conflict ([design-language.md](../ui/design-language.md) section 7), when:

| Reason | IDs |
| --- | --- |
| The same key arrives with different content: kept for investigation, and the device's renewal stops (3.3) | `PRD-INT-002`, `PRD-OFF-010` |
| Its number is already recorded with another bill, or its series is closed | `PRD-OFF-009`; numbering-and-audit 3.4 |
| It was received inside a paused interval (9.1) | `PRD-OFF-014` |
| Its quantity does not fit the protected quantity | stock-ledger 10.5 |
| Pricing it again gives another result | shared-calculations 2.2 |
| Its authority or working set was not valid at its event time, or its event time is past the clock tolerance (10.1) | `PRD-OFF-003`, `PRD-OFF-004` |
| It used a tender not permitted offline | `PRD-OFF-017` |
| No valid posting map | module-map 6.3 |
| It came from a Revoked device | `PRD-SEC-008` |

- Each queued bill raises an exception in its own transaction, routed by `POL-02.16`: stock to Operations, money to Accounts (`POL-16.05`). The real owners and due times are OPEN (V-03).
- Its stock effect posts when the owner resolves the exception; money differences follow the money route (stock-ledger 10.5, `POL-16.05`). The bill itself is never edited; any difference is its own linked record (`PRD-MOD-011`).
- How a duplicate or missing bill number from a cloned, restored or lost device is treated as a tax document is OPEN (GC8-5).
- Missing, stuck or refused uploads show to authorised operators (`PRD-SEC-013`).

## 9. Pause and release

Protected quantity is released only while online, after the sequence and queue are reconciled and the billing is durably paused on both the counter and the server (`PRD-OFF-011`).

### 9.1 Pause

1. An authorised person asks, online, to release some or all of the counter's protected quantity, or to retire the counter. The server records a pause request.
2. At its next contact the counter commits the pause in IndexedDB: finalisation stops, open carts are kept. It then reports, for each series, the financial year and its next sequence number (`PRD-OFF-012`).
3. The server records the central pause at that pause point, and pauses the series (4.4).
4. The queue is reconciled: every number below the pause point is either accepted or in the reconciliation queue, and none is missing. Until then nothing is released.

- A missing reply at any step leaves the counter paused (`PRD-OFF-012`).
- The pause survives a restart: it is in IndexedDB, not in memory (`PRD-OFF-013`).
- A bill received later whose number is at or past the pause point is flagged and kept, never discarded to clear the conflict (`PRD-OFF-014`).

### 9.2 Release

- Once 9.1 is complete, the server releases the protected quantity asked for, as a release of the reservation (stock-ledger 6.1), in one transaction with its audit record (`PRD-OFF-006`, `PRD-OFF-011`).

### 9.3 Resume

- The counter resumes only after the server confirms it online and the counter has received and stored a full fresh snapshot of its protected quantity, replacing its local balances whole (`PRD-OFF-013`). The series are then Open again.

### 9.4 Across a year boundary

- The pause point is a financial year and a next sequence number for each series. A pause that crosses a year end compares the year first, then the sequence, so the new year's first number is recognised as after the pause (`PRD-OFF-012`).

## 10. Clock, business date and device trouble

### 10.1 Clock

An offline bill's event time is the device's time (code-house-rules 9), so a wrong clock must be caught (`PRD-OFF-019`). **Proposed:**

- At every online contact the counter stores the server's time beside its own.
- Offline, the counter blocks finalisation when its clock reads earlier than the latest time it has recorded: a clock that moved back. This needs no threshold.
- At renewal, the server refuses when the device clock differs from its own by more than a tolerance. On upload, a bill whose event time is later than the server's time on receipt by more than that tolerance goes to the queue. The tolerance is a technical setting with no default (GC8-2); until it is set, no authority is issued.
- The counter checks its own time against the authority's end and the working set's validity time; the server checks them again on upload with its own record (8.2).

### 10.2 Business date

- An offline bill's business date is the date of its event time under the Organisation's timezone, as for an online bill (`PRD-MOD-009`; code-house-rules 9). The financial year, and so the series, follow from it (4.3).
- How the offline counter's till session and the Store's day close treat bills not yet uploaded is the stage 4 counter design's (GC8-10).

### 10.3 Duplicate tabs, full storage, upgrade, loss, connection loss

`PRD-OFF-019`, `PRD-ACP-011`. **Proposed** throughout.

| Trouble | What the counter does |
| --- | --- |
| A second tab | Only the tab holding the device's Web Lock can finalise, upload or pause. Another tab shows that the counter is open elsewhere and cannot finalise |
| Full storage | The counter asks the browser for persistent storage at enrolment. A commit that fails for space aborts whole (7.3): nothing is lost and new bills stop until space is freed. A finalised bill is removed from the device only after the server has stored it, and only under a retention setting with no default (GC8-3); until it is set, nothing is removed |
| App upgrade | A new version waits until no cart is open, then the writer tab switches. Dexie upgrades only add (5.3). The server accepts bill uploads from every app version that may still hold unsent bills |
| Device loss | The device is revoked (3.5); its authority ends at its bounded expiry; its unsent bills and protected quantity are GC8-1 and GC8-5 |
| Connection loss | The offline counter goes on within its authority. An online till stops finalising |

A finalised bill is never deleted by any of these.

## 11. The devices readiness check

This defines the "devices" check of `PRD-LIF-002` (RR-016). `S1-F12` adds it to the readiness checks of `S1-F04` (module-map 4.16). It adds no business prerequisite: it checks only that the bills a selling unit needs can be numbered, which `PRD-POS-020` and `PRD-OFF-002` already require.

| Activity of a business unit | The check passes when | IDs |
| --- | --- | --- |
| Selling | At least one Active billing device of the unit's Store lists the unit, and each such device has an Open series for the registration of the unit's mapping in force on the check date, in that date's financial year. Revoked and Ended devices do not count | `PRD-LIF-001`, `PRD-LIF-002`, `PRD-POS-020`, `PRD-OFF-002` |
| Receiving, movement | Not applicable: no PRD rule ties them to a billing device | `PRD-LIF-001` |

- A failed check names what is missing: no device, or a device with no series and why (no confirmed format, no financial-year dates, a mapping with no registration) (`PRD-UXP-003`).
- It asks for no offline counter, offline authority or protected quantity, and no number of devices beyond one: offline is optional per Store (`POL-16.01`), and a count of tills is not a PRD rule.
- Until `S1-F12` registers this check, the selling activity's devices check answers "not available yet", and selling readiness fails with that reason. **Design choice** (fail-safe).

## 12. Interface, events and tables

### 12.1 Interface

Operations of `pos` for billing devices, in words; names and shapes become exact in code (module-map section 4). **Proposed.**

| Operation | Stage | What it does | Refuses when |
| --- | --- | --- | --- |
| Register a billing device | 1 | Creates it Setting up, for a Store and its units (3.2) | A unit is not a whole-store or brand-counter unit of the Store |
| Enrol a device | 1 | Binds the public key; Active; defines its series where their format and financial-year dates exist, and otherwise none (3.2, 4.1) | Already enrolled; bad proof |
| Change a device's units | 1 | Dated change; defines series for any new registration (4.3) | The device is not Active |
| Prove a device | 1 | Checks a signature over a challenge, for sign-in and device requests (3.3) | Unknown key; Revoked or Ended device |
| Revoke, retire, replace | 1 | Section 3.5 | Revoked or Ended already |
| Answer the devices check | 1 | Section 11 | — |
| Designate the offline counter | 4 | Section 6.1 | Not available under policy 16; another designation in force |
| Renew offline authority | 4 | Section 6.2 | Any condition of 6.2 fails |
| Allocate protected quantity | 4 | Section 6.6 | Above the Store's limit; not available stock |
| Upload a bill | 4 | Section 8 | — (a bill that does not fit is queued, not refused) |
| Pause, confirm pause, release, resume | 4 | Section 9 | Out of order; a missing reply leaves it paused |

### 12.2 Events

`pos.device-registered`, `pos.device-enrolled`, `pos.device-ended`, `pos.offline-authority-renewed`, `pos.offline-bill-received`, `pos.billing-paused`, `pos.protected-quantity-released`, `pos.billing-resumed`. Revocation publishes `access.device-revoked` (3.5). Events carry identifiers only (PRD Stack: Live updates). **Proposed.**

### 12.3 Tables

Each module owns one schema; a reference to another module's record keeps its identifier without a foreign key ([structure-and-masters.md](../masters/structure-and-masters.md) 2.5). Other columns are left to reviewed migrations. **Proposed.**

| Schema | Table | Stage | Unique | Other constraints |
| --- | --- | --- | --- | --- |
| `access` | `device` + versions (exists, access-and-approvals 13.1) | 1 | code | the public key is set once at enrolment and never changed; Revoked and Ended are final |
| `pos` | `billing_device` | 1 | device | Store fixed |
| `pos` | `billing_device_unit` (dated) | 1 | — | units of the device's Store only |
| `pos` | `offline_designation` (dated) | 4 | — | no two in force for one Store |
| `pos` | `offline_authority` | 4 | device and version | append-only; holds the hash of the renewal token, never the token |
| `pos` | `working_set_version` | 4 | Store and version | append-only |
| `pos` | `offline_upload` | 4 | device, registration, financial year and number | append-only; content hash kept |
| `pos` | `billing_pause` + events | 4 | one open per device | append-only events |
| `pos` | `reconciliation_item` | 4 | upload | linked to its exception |

The protected quantity is a reservation in `stock` (stock-ledger 6.1); series and numbers are in `numbering` (numbering-and-audit 6.1).

## 13. What stage 1 builds

`S1-F12` builds billing devices and their series only. Offline billing waits for `S4-F11` and signed policy 16 (AGENTS.md "Delivery", DEC-051).

| Built in stage 1 | Waits for stage 4 |
| --- | --- |
| `access`: device enrolment with its key, device proof at sign-in, shared POS sessions bound to a device, revocation ending its sessions | Offline designation, authority, renewal chain |
| `pos`: billing devices, their Store and units, revoke, retire and replace; the devices readiness check | Working set, protected quantity, upload, reconciliation queue, pause and release |
| `numbering`: a series per device, registration and financial year, defined at enrolment and on a mapping change; a second open series refused; closed series never continued | Record used numbers on upload |
| Back office: Setup › Devices, tills and bill series ([ui-blueprint.html](../ui/ui-blueprint.html)), with its Admin journey | The till screens |
| `apps/counter`: the build, the golden page and its Playwright run (`S1-F11`); the enrolment and sign-in pages, with Dexie for the device key (`S1-F12`); served at `/counter/` | Workbox, the offline shell, the local commit |

- Live gates: the financial-year dates (GC5-1, RR-060) and the bill-number format (V-40, RR-101) before a live series; policy 2 for live sessions. Tests use labelled synthetic values (`AGENTS.md`: "Never invent a value").
- `DEC-112` left RR-015 and the devices check open at their gates; this design answers both, and the product owner approved them on 6 Oct 2026 (sections 5 and 11; DEC-116).

## 14. Tests

All data is labelled synthetic and never becomes a default. Tests run against real PostgreSQL; browser tests run in Chromium.

### 14.1 Stage 1

`S1-F12` must pass numbering-and-audit 7 tests 2 to 4 and access-and-approvals 15 test 5, and these:

| # | Test | IDs |
| --- | --- | --- |
| 1 | A device registered for a Store, once enrolled, gets one Open series per registration of its units for the current synthetic financial year; a device whose units map to two registrations holds two | `PRD-POS-020`, `PRD-OFF-002`, DEC-005 |
| 2 | A unit of another Store, or an office or warehouse unit, is refused | `PRD-ORG-005` |
| 3 | A second enrolment of a device is refused; a proof signed by another key is refused; a Revoked or Ended device's proof is refused | `PRD-OFF-010`, `PRD-SEC-008` |
| 4 | A sign-in with a valid device proof makes a shared POS session bound to the device; without it, an office session | `POL-02.18` |
| 5 | Revoking an online till ends its sessions at their next request and closes its series in the same transaction; a closed series refuses allocation and never reopens | `PRD-SEC-008`, `PRD-OFF-010` |
| 6 | A replacement is a new device with a new code and fresh series; the old series stays closed | `PRD-OFF-010`, `PRD-LIF-015` |
| 7 | A unit's mapping changing to a new registration from a future date gets the device's series for that registration before the date | `PRD-ORG-005`, `PRD-POS-020` |
| 8 | With no confirmed format or no financial-year dates, enrolment defines no series and the devices check fails with that reason | `POL-10.07`, `PRD-UXP-003` |
| 9 | The devices check: selling fails with no Active device listing the unit, or with no Open series for its registration and year; passes when both hold; Revoked and Ended devices do not count; receiving and movement are not applicable | `PRD-LIF-002`, `PRD-LIF-001` |
| 10 | Registration, enrolment and revocation each write an audit record and an access record, and commit with them or not at all | `PRD-ACS-013`, `PRD-SEC-007`, `PRD-INT-004` |
| 11 | The device's private key is non-extractable: exporting it from the page fails | `PRD-OFF-010` |
| 12 | The Admin journey on Setup › Devices, tills and bill series: what the Admin may do, and the refusals with their reasons | `PRD-SEC-016` |

`S1-F11`'s counter run (5.5): every golden case gives the same result on the counter as on the server, and the counter's module list holds no costing module (`PRD-ACP-018`, `PRD-OFF-004`).

### 14.2 Stage 4, before offline is enabled

`S4-F11` must pass these before offline is switched on (`PRD-ACP-011`; [roadmap.md](../../plan/roadmap.md) stage 4):

| # | Test | IDs |
| --- | --- | --- |
| 13 | Power loss: the browser killed right after success keeps the bill, the advanced sequence, the reduced quantity and the pending-sync record; killed before it, keeps the cart and nothing else | `PRD-OFF-007`, `PRD-OFF-008` |
| 14 | Restart keeps carts, bills, the pause and the authority | `PRD-OFF-008`, `PRD-OFF-013` |
| 15 | Expired authority and expired working set each block finalisation, keep the work and release nothing | `PRD-OFF-003`, `PRD-OFF-004` |
| 16 | Full storage aborts the commit whole and keeps the cart | `PRD-OFF-019` |
| 17 | A second tab cannot finalise | `PRD-OFF-019` |
| 18 | A clock moved back blocks finalisation; a clock beyond the synthetic tolerance is refused renewal and its bills are queued | `PRD-OFF-019` |
| 19 | Device replacement: the old queue is reconciled before the designation moves; the new device has fresh series | `PRD-OFF-010` |
| 20 | A restored copy presenting a stale renewal token, and a clone reusing one, are refused renewal; a clone's colliding numbers are kept as conflicts | `PRD-OFF-010`, `PRD-INT-002` |
| 21 | Repeated upload posts once; changed content under the same key is kept for investigation | `PRD-OFF-009`, `PRD-INT-002` |
| 22 | A pause crossing a synthetic year end compares year then sequence; a missing reply leaves the counter paused; release waits for reconciliation; resume needs confirmation and a full snapshot | `PRD-OFF-011`–`PRD-OFF-013` |
| 23 | A bill received inside a paused interval is flagged and kept | `PRD-OFF-014` |
| 24 | Returns, refunds and the online-only tenders and approvals are refused offline; an e-invoice-applicable bill is refused offline | `PRD-OFF-015`, `PRD-OFF-016`, `PRD-OFF-018` |
| 25 | Central sale, reservation and dispatch cannot take protected quantity | `PRD-OFF-006` |
| 26 | No store of the counter's IndexedDB and no response to it holds cost, margin, receipt-origin value or any field of 6.4 | `PRD-OFF-004`, `PRD-SEC-006` |
| 27 | Offline durable finalisation is measured against its 300 ms target on the reference devices | `PRD-PRF-001` |
| 28 | A large posting job does not delay counter finalisation or upload | `PRD-PRF-003` |

## 15. Open questions

Nothing below has a default. Questions already open elsewhere are pointed to, not repeated: the approved offline Stores, counters, allocation limits and cash-first start (V-36, `POL-16.01`, `POL-16.02`, `POL-16.04`); the external-terminal evidence procedure (V-37); which tenders may be recorded offline (DEC-082); the working-set validity time (V-66, `POL-16.07`); the bill-number format (V-40, `POL-10.07`); the financial year (GC5-1); e-invoice applicability (V-41); exception owners and due times (V-03).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC8-1 | How the protected quantity of a lost offline counter is released. `PRD-OFF-011` needs a durable local pause, which a lost device can never confirm, so as written that quantity stays protected for ever. The PRD names no other route | Business | Product owner (PRD); KDPS Owner, Operations (policy 16 conflict resolution) | 4 live (offline) | Stock stuck after a device loss |
| GC8-2 | The clock tolerance for renewal and for an uploaded bill's event time (10.1) | Technical | Product owner | `S4-F11` live; tests use a synthetic value | Which clocks are trusted |
| GC8-3 | How long a bill already stored on the server stays on the device (10.3). Until set, nothing is removed, so storage can fill | Technical | Product owner, with Admin | `S4-F11` live | Device storage over time |
| GC8-4 | Whether only users who signed in online on the device in the authority period may act offline, as **Proposed** in 6.5. A shift change during an outage cannot start a new user | Business | KDPS Owner, Operations | 4 live (offline) | Who can bill during an outage |
| GC8-5 | The tax-document treatment of a duplicate bill number from a cloned or restored device, and of numbers a lost device used but never uploaded | Business, statutory | CA, Accounts | 4 live (offline) | Statutory invoice series |
| GC8-6 | How a step needing online authority (provider-confirmed card, Store-credit or gift-voucher redemption, a fresh approval, an IRN) binds to a bill the offline counter numbers locally while online (4.2; `PRD-RET-016`, `PRD-RET-020`, `PRD-POS-019`) | Technical | Stage 4 counter design | `S4-F02` and `S4-F11` design | Online steps on the offline counter |
| GC8-7 | Answered by the product owner, 6 Oct 2026 (DEC-116): the device state names Setting up, Active, Ended and Revoked are approved (3.1) | Design review | — | — | Names on Setup › Devices |
| GC8-8 | Answered by the product owner, 6 Oct 2026 (DEC-116): yes. Enrolment is a protected action that asks for a fresh authenticator code (3.2), added to the GC3-6 list | Business | — | — | Who can enrol a device |
| GC8-9 | How a device-signed upload, made with no user signed in, fits access-and-approvals 7.1 and row-level security: the device as principal, the bill's operator as actor, the Store as scope (8.1) | Technical | Product owner, in the stage 4 counter design and house rules part B | `S4-F11` code | Uploads after sign-out |
| GC8-10 | How the offline counter's till session and the Store's day close treat bills not yet uploaded (10.2) | Business | Stage 4 Store-day design; Accounts | `S4-F08` and `S4-F11` design | Day close with an offline counter |

**Approved by the product owner, 6 Oct 2026:** sections 3 to 5 and 11; RR-015 (`apps/counter`, served at `/counter/`, its browser tests in `apps/counter/e2e/`, the golden runner bundled into the test page, 5.5); GC8-7 and GC8-8 (DEC-116); enrolment with no format or financial-year dates succeeds and defines no series (4.1; DEC-116). **Still Draft:** sections 6 to 10; their remaining decisions are due before the stage 1 exit gate. GC8-1 to GC8-6, GC8-9 and GC8-10 stay open at their gates.
