# Stage 1 manual QA

> **Not ranked.** A hand-test script for the stage 1 build on Railway `dev`. It decides nothing: where it disagrees with the PRD, the policies or a design, they win and this file is wrong. A failed case is a finding to triage, not a decision.

Who it is for: the product owner, testing by hand in a browser. Part 1 says in plain words what stage 1 built and why. Part 2 is the test script, in the order the data has to be built.

- [Part 1. What stage 1 built, and why](#part-1-what-stage-1-built-and-why)
- [Part 2. The test script](#part-2-the-test-script): [before you start](#20-before-you-start), [not built yet](#21-not-built-yet-do-not-report), [built but not testable by hand](#22-built-but-not-testable-by-hand-yet), [the cases](#23-the-cases), [after you finish](#24-after-you-finish)
- Sample files: [files/](files/)

## Part 1. What stage 1 built, and why

Stage 1 is the **shared foundation**: nothing here sells, receives or moves real goods yet. It builds the rules every later stage must obey: who may do what, who must approve it, where every record belongs, how money and stock are recorded, and that nothing runs before its policy is signed.

Four ideas run through all of it. You will meet them in almost every test.

- **Two people for every change that matters.** One person prepares, a different person approves. You can never approve your own change. This is "independent approval" (`PRD-ACS-006`, `PRD-ACS-023`).
- **Nothing is on by default.** Every business operation starts switched off and says why it is unavailable until its KDPS policy is signed and validated (`PRD-SEC-017`).
- **Nothing is overwritten.** A change creates a new version; the old one stays in history. Who did what, and when, is always visible (`PRD-SEC-001`).
- **Unknown is not zero.** A value nobody has given stays Unknown, and the system refuses to treat it as 0 (`PRD-MOD-015`).

Each feature below has: what it does, why it exists, and how you can see it.

### S1-F01 Sign-in and access control

- **What:** People sign in with the Organisation code, their login, a password and a 6-digit code from an authenticator app on their phone. A new user starts with a temporary password, scans a QR code into the authenticator, and must choose a new password. Admins create users and roles; a role is a set of permissions ("view users", "approve roles"…); a role assignment gives a role to a person, from a date, optionally only for some places. Every one of these changes waits for a second person's approval in **My work**. Idle screens lock and ask for the password again, keeping unsaved work. Every change and every sign-in is in **History**.
- **Why:** No one should be able to give themselves access, and every action must be traceable to one real person (`PRD-SEC-001`, `PRD-ACS-006`, `PRD-ACS-023`, `POL-02.07`).
- **See it:** Sign-in, Setup › Users, Roles, Role assignments, Reasons, Security settings, Audit log, and My work. The very first Admin and approver of an Organisation are created by an operator command, not a screen.
- **Note:** the "demo sign-in" buttons on `dev` skip the password and authenticator for the four seeded people only. They exist only on `local` and `dev`, only for `SYN-` Organisations, and each use is recorded (`DEC-121`).

### S1-F02 Organisation structure and verified mappings

- **What:** The Admin builds the business's skeleton: legal entities (the companies), their GST registrations, accounting books, geography (country, state, city, area), Sites (a physical place), Stores (a selling place at a Site), business units (a line of business at a Site) and locations (shelves, rooms). Each business unit is mapped, by date, to exactly one legal entity, one registration and one book, and a *different* person (Accounts) must verify that mapping before it counts. Role assignments can now be limited to chosen Sites or Stores, and a chosen Site covers Stores added to it later.
- **Why:** Which company and which GST number a sale belongs to must never be guessed from the address; every stock balance must belong to exactly one owner and book (`PRD-ORG-005`, `PRD-ORG-012`, `POL-10.08`).
- **See it:** Setup › Organisation structure, Setup › Geography; mapping verification; role assignments with selected places.

### S1-F03 Product and party masters

- **What:** Booking keeps the product catalogue: brands, categories, size sets, attributes (colour, season, fit) and their allowed values, styles and their SKUs (one per size and colour), external codes (a supplier's or old POS's code for the same SKU), packs and tracking profiles. A new value or a new product is a *proposal* that a different person confirms. Booking also keeps parties (suppliers and others), which brand each supplier supplies, and dated agreements with their terms. Supplier bank details are encrypted, shown masked, revealed only after a fresh authenticator code, and changed only with a second person's approval.
- **Why:** Free text typed by one person must never become master data, and nobody alone should be able to redirect a supplier's payments (`PRD-MER-013`, `PRD-IMP-008`, `PRD-ACS-008`).
- **See it:** Setup › Vocabularies, Products, Tracking profiles, Suppliers and agreements, Agreement.

### S1-F04 Policy readiness and Site activation

- **What:** A list of KDPS's 19 policies with each one's status. An Admin records a policy as Signed with evidence (the signed document); a person who did not enter its values validates it. Every capability (receiving, moving, selling…) ships switched off. Any operation that would record a business effect first asks "is this available?" and, if not, shows exactly what is missing. A Site's business unit is switched on for receiving, movement or selling only after its readiness checks pass and a second person approves.
- **Why:** KDPS's policies are not signed yet; the system must not run on guessed values, and a Site must not trade before it is ready (`PRD-SEC-017`, `PRD-LIF-002`). Two of the stage 1 exit checks are these.
- **See it:** Setup › Policy readiness, Setup › Site opening and closure.

### S1-F05 Approval authority

- **What:** Approval limits per action type, held by a role or by a named person, with an amount and dates. A request goes to the people whose limit covers it; if nobody's does, it waits. A request whose value is Unknown needs explicit authority. A person can hand their approvals to a stand-in for a limited time. Some request types may be approved in bulk; an item that no longer passes its checks drops out of the bulk and waits. Overdue approvals escalate.
- **Why:** Authority must be written down and explicit; nothing is approved by default or by whoever happens to see it (`POL-02.09`, `PRD-ACS-015`, `PRD-ACS-016`, `PRD-ACS-018`, `PRD-ACS-019`).
- **See it:** Setup › Approval limits; stand-ins and bulk approval in My work.

### S1-F06 File intake and a synthetic master import

- **What:** Every uploaded file is stored encrypted, fingerprinted, never overwritten or deleted, and can be attached to a record as evidence. Spreadsheets (XLSX) can be imported: the system refuses files with macros, external links or over the size limits; recognises the file's layout from its columns; stages every value with where it came from; produces a validation report; and a reviewer publishes each document. Uploading the same rows again is caught as a duplicate. An Outcomes report shows what each import did.
- **Why:** Imports are how KDPS's data gets in; each one must be traceable to its file and must never post twice (`PRD-IMP-001`, `PRD-IMP-002`, `PRD-IMP-005`, `PRD-IMP-011`, `PRD-SEC-011`).
- **See it:** Setup › File intake (batches, saved layouts, outcomes, comparisons), and the Evidence parts of records.
- **Not in stage 1:** XLS, XLSB and CSV files, the KDPS sample layouts and the large price-ticket file test moved to stage 2 (`DEC-115`).

### S1-F07

Moved to stage 2 as `S2-F13` (`DEC-115`). Nothing to test.

### S1-F08 Number series and exceptions

- **What:** Document numbers are taken inside the document's own save, so there are never gaps or duplicates. When something goes wrong, the system raises an **exception**: a problem record with an owner, a due time and escalation, which shows in the owner's My work, takes comments and evidence, and can only be closed when the module that raised it agrees the problem is fixed. An exception survives even when the action that found the problem is rolled back. Background jobs that keep failing are listed for operators. My work updates live, without reloading.
- **Why:** Numbering must be provable to auditors, and no failure may go unseen (`PRD-MOD-004`, `PRD-EXC-001`, `PRD-EXC-002`).
- **See it:** My work, Setup › Exception rules, Setup › Operations. There is no screen to define number series yet (RR-449).

### S1-F09 Books, posting maps, periods and tax-rule records

- **What:** Each accounting book has its own cost method and settings, chart of accounts and **posting maps** (which account each kind of stock or money event posts to). Posting maps are prepared by one Accounts person and approved by another, with the CA's approval attached as evidence. Journals always balance and are reversed, never edited. Financial periods are locked in order; reopening one names exactly which corrections are allowed and needs a second person. Tax rules are kept by date.
- **Why:** Stock and money must be valued by each book's own rules, never by a default, and closed months must stay closed (`PRD-LED-001`, `PRD-LED-009`, `PRD-LED-014`, `PRD-LED-015`, `POL-09.01`).
- **See it:** Setup › Posting maps, Money › Internal ledger (trial balance), Money › Period close. Book settings, accounts and tax rules have no screens in stage 1; they are set through the API (`DEC-116`).

### S1-F10 Stock ledger (server only, no manual test)

- **What:** The single place every stock change is recorded, as movements that are only ever added, never edited. It keeps five facts apart: where a piece physically is, whether it has a price-ticket, whether it can be sold, who owns it, and when accounting recognises it. It holds holds and reservations, freezes stock during counts, and values every movement (FIFO or moving average, per book or per Site) while posting a balanced journal in the same step.
- **Why:** Every piece must be traceable to its place, owner and value, and stock and accounts must never disagree (`PRD-LED-014`, `PRD-LED-015`, `PRD-MOD-013`). This is stage 1 exit check 3.
- **How it's proven:** stage 1 has no receiving or selling screens, so a test-only harness drives the ledger through 13 golden scenarios on real PostgreSQL, under both cost methods and both pool modes, plus concurrency tests. They run in CI on every push. Stages 2–4 put screens on top of it.

### S1-F11 Shared calculations (code only, no manual test)

- **What:** One package works out price, offers, discounts, GST and round-off, in whole paise, and gives exactly the same answer on the server and on the till. The till's copy provably contains no cost-price code.
- **Why:** A bill must never change between the till and the server, and cost must never reach a till (`PRD-MOD-007`, `PRD-ACP-018`, `PRD-OFF-004`). This is stage 1 exit check 2.
- **How it's proven:** 38 golden cases run on the server and in a Chrome copy of the counter build in CI; a build guard fails the build if costing code enters the counter. Live tax and offer values wait for KDPS.

### S1-F12 Billing devices and device bill series

- **What:** An Admin registers each till (billing device) for a Store and its business units, then enrols it once in the counter app at `/counter/`: the till makes its own key, which never leaves the browser. Each till gets its own bill-number series per GST registration and financial year, so two tills can never issue the same number, even offline. Tills can be revoked, retired or replaced; a replacement starts a fresh series. Financial years and bill-number formats need a second person's approval.
- **Why:** Bill numbers must be unique per till and never continue a closed series (`PRD-POS-020`, `PRD-OFF-002`, `PRD-LIF-015`).
- **See it:** Setup › Devices; `/counter/` for enrolment and till sign-in. There is no billing screen: offline billing comes in stage 4.

### S1-F13 Opening-data layouts and reconciliation

- **What:** The path for loading KDPS's starting position: opening stock, customer dues, advances and deposits are staged and validated from files, with Unknown kept as Unknown. The old POS's stock-on-hand and sales reports can be loaded as reference only and compared. Comparison runs list every difference. Publishing opening data is blocked until policy 14 is Signed and validated, and the screen says so.
- **Why:** To prove the switch-over path early, on synthetic data, without ever counting anything twice (`POL-14.07`, `PRD-LIF-004`, `PRD-LIF-009`, `PRD-LIF-027`, `PRD-SEC-017`).
- **See it:** Setup › File intake (batch screen with Publish unavailable, Comparisons). Posting opening counts into the ledger runs only in tests.

### S1-F14 Backup, restore and export proof (operator commands, mostly no manual test)

- **What:** Operator commands take an encrypted, signed backup of every Organisation's database and files, and restore it into a fresh, empty environment, checking every total, file fingerprint and audit seal. A restored Organisation is held, with number series paused, until people reconcile it and reopen it.
- **Why:** A backup is worthless unless it restores with all its linked records and attachments (`PRD-SEC-012`, `POL-18.02`, `POL-18.03`, `POL-18.04`). This is stage 1 exit check 4.
- **See it:** Setup › Operations shows backup records and recovery status. The full backup and restore runs in CI; the drill on `dev` is the last open stage 1 ticket (`S1-F14-T04`), separate from this QA.

## Part 2. The test script

### 2.0 Before you start

**When.** After `S1-F14-T04` (the restore drill) is finished. Merge nothing into `main` until you have finished, because every merge redeploys `dev` under you.

**Write down first:**

- The date: ________
- The commit `dev` runs: ________. The app shows no version number, so read it from Railway: `app` service › Deployments › the active one. Note it as a finding if you want the app to show it.

**Where.** <https://app-dev-53bf.up.railway.app/> for the back office, and the same address plus `/counter/` for the till app. Use desktop Chrome.

**Windows.** One Chrome profile holds one signed-in person, and signing in again replaces them. Make four Chrome profiles (or use Guest for one) and keep them side by side:

| Profile | Who signs in there |
| --- | --- |
| QA admin | **A**, SYNTHETIC First Admin A (`syn-admin-a`) |
| QA approver | **P**, SYNTHETIC First Approver A (`syn-approver-a`) |
| QA others | The users you create: **AC** (`syn-accounts-a`), **SR** (`syn-store-reader-a`), **NR** (`syn-norole-a`), and later ORG-B |
| QA counter | Only `/counter/`. Never use an incognito window for the counter: its device key is lost when the window closes |

**Your phone.** You need an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). Every approval asks for a fresh code from it, and each new user sets one up.

**The seeded users must have a real authenticator.** The demo buttons skip the password and the code, but every approval decision still asks for a fresh authenticator code. So A and P must each have finished one real first sign-in (QA-02) before anything else. If you did this already, mark QA-02 as done.

**Sample files** are in [files/](files/). All are SYNTHETIC:

| File | Used for |
| --- | --- |
| `SYNTHETIC-qa-evidence.pdf` | Evidence anywhere a PDF is asked for: mapping verification, policy signing, the signed agreement |
| `SYNTHETIC-qa-photo.jpg`, `SYNTHETIC-qa-photo.png` | Evidence as a photo, on an approval decision |
| `SYNTHETIC-qa-products-1.xlsx` | A product file with one style, for layout detection and the duplicate-bytes check |
| `SYNTHETIC-qa-products-2.xlsx` | The same style plus a second one |
| `SYNTHETIC-qa-macro.xlsx` | A workbook with a macro, which must be refused |
| `SYNTHETIC-qa-not-a-workbook.xlsx` | Plain text with an `.xlsx` name, which must be refused |

**Habits that avoid false failures:**

- Start every code with `SYN-QA-` and every name with `SYNTHETIC`, so nobody mistakes test data for KDPS data.
- Prepare and approve on the same day. A draft that waits overnight goes stale and must be re-dated.
- Approve a parent before you prepare its child: Country before State, Site before Store, and so on. The approval refuses a child whose parent is not in force yet.
- After A prepares something, P presses **Refresh** in My work. My work never refreshes by itself; the item can take up to about 30 seconds to appear.
- Every decision needs a **new** code: wait for the authenticator code to change between two decisions.
- The **Expect** lines quote the screen. Small differences in punctuation or apostrophes are fine. A different meaning is a Fail.

**How to record a result.** Under each case, write one of:

- **Pass:** it did what Expect says.
- **Fail:** it did something else. Note what you saw, and save a screenshot to `docs/qa/stage-1/screenshots/` named after the case (`QA-17.png`).
- **Should exist:** it works as described, but you think it should work differently or be there. Say what you expected.
- **Blocked:** an earlier case failed, so this one could not run. Name it.

Each case is tagged **Must** or **Nice**. For a short first pass, run the Must cases only, in order. Nice cases can be skipped without breaking later ones, except where a case says it needs one.

### 2.1 Not built yet: do not report

These are deliberate gaps of stage 1. Mark one **Should exist** only if you think it must come sooner than planned.

- No screen to define number series and their formats (RR-449).
- Book settings, the chart of accounts and tax rules have no screens. They are API only in stage 1, and their screens come before the first live posting in stage 2 (`DEC-116`).
- No screens for the steps after a restore: reconciling series, validating and reopening (RR-531).
- No till, billing, receiving, stock transfer or count screen. Offline billing is stage 4.
- Only XLSX files import. XLS, XLSB, CSV and the KDPS sample layouts are stage 2 (`DEC-115`).
- Everything is in English. Hindi, email, WhatsApp and SMS arrive in stage 5 (`DEC-099`).
- No brand coverage screen for brand-counter units (API only).
- The app shows no build number or commit.

### 2.2 Built but not testable by hand yet

These work, and automated tests prove them on every push (CI on `main` passed on 18 Oct 2026, run 39159906344). They cannot be completed through the browser on `dev` because a step before them has no screen yet. The cases below go as far as the screen goes and expect the "unavailable" message or the empty state. Hand tests for the rest come when the missing piece is built.

| Area | How far the browser gets | What stops it | What proves it today |
| --- | --- | --- | --- |
| Stock ledger (`S1-F10`) | Nowhere: no screens | No receiving, moving or selling documents exist until stage 2 | Golden scenarios G2 to G13 and concurrency tests on real PostgreSQL |
| Shared calculations (`S1-F11`) | Nowhere: no screens | It is a code package | 38 golden cases on the server and in the counter build; the build guard |
| Backup and restore (`S1-F14`) | Setup › Operations view shows backup records (QA-53) | Backup and restore are operator commands | The CI restore test, and the `dev` drill of `S1-F14-T04` |
| Posting maps, period close, trial balance (`S1-F09`) | Book picker and empty states (QA-77) | Accounts, periods and book settings are API only (`DEC-116`) | The posting-maps and period-close browser journeys, and the finance tests |
| Starting an import (`S1-F06`) | Upload, layout detection, duplicate-bytes notice, refusals. **Start the import** is refused (QA-69) | No screen opens a number series for import batch codes (RR-449) | The file-intake and import-duplicates journeys |
| Raising and working an exception (`S1-F08`) | Exception rules only (QA-52) | Exceptions come only from failed jobs or a restore; the number series has no screen | The exceptions, evidence and live-updates journeys |
| Site activation (`S1-F04`) | Run the checks shows what fails (QA-57) | No receiving, moving or selling operation exists yet, so a Site can never be made ready | The site-readiness journey, with a test-only operation |
| Policy validation and opening-data publishing (`S1-F04`, `S1-F13`) | Signing works; validating policy 14 is refused (QA-55) | Nothing reports policy 14's values yet; opening batches can't be started from a screen | The policy-readiness and opening-publish journeys |
| Approval limits, bulk approval, stand-ins (`S1-F05`) | The forms open (QA-50, QA-51) | No approval type with a money value exists yet, and none is allowed in bulk | The approval-limits and bulk-approval journeys, with test-only types |
| Comparisons of opening data (`S1-F13`) | The empty tab | Needs an opening batch and an earlier-POS stock report, neither startable from a screen | The opening-data tests |

### 2.3 The cases

#### A. Getting in (`S1-F01`)

##### QA-01 · Must · S1-F01 · Sign-in page and the dev banner
- **Who:** nobody signed in.
- **Do:** Open the app's address. Then open `/setup/users` directly.
- **Expect:** A banner at the top reads "dev · SYNTHETIC data only". The heading is "Sign in", with fields `Organisation code`, `Login`, `Password` and `Authenticator code`, and a `Sign in` button. Below it, a section "Test sign-in (dev only)" reads "Signs in a SYNTHETIC person straight away, without the password or the authenticator code. Never on KDPS test or production." and has one button per seeded person. `/setup/users` also shows "Sign in": no screen opens without signing in.
- **Result:** · **Notes:**

##### QA-02 · Must · S1-F01 · First real sign-in of A and P (skip if done)
- **Who:** A in the QA admin profile, then P in the QA approver profile.
- **Do:** Sign in with Organisation code `SYN-ORG-A`, the login, and the temporary password from your `SYNTHETIC-dev-first-users.secrets.json`. Leave `Authenticator code` empty. Follow the screens: `Show the setup key`, scan the QR code with your phone, type the code, `Confirm the app`. On the next screen type two different new passwords first, then the same one twice with a new code, and press `Change password`.
- **Expect:**
  - "Set up your authenticator app", with the warning "This key is shown only now and never again. Add it to your authenticator app before you go on."
  - "Choose your own password". Two different passwords give "The two passwords are not the same. Enter the new password again."
  - The app opens: A on Setup › Users, P on My work, with their name in the top bar.
- **Result:** · **Notes:**

##### QA-03 · Must · S1-F01 · Demo sign-in and what the first people can see
- **Who:** A and P, through their demo buttons.
- **Do:** Sign out, then press the demo button for SYNTHETIC First Admin A. Look at the sidebar. Repeat for P in the approver profile.
- **Expect:** One press signs in, with no password or code. The sidebar shows only Home › My work and these Setup screens: Users, Roles, Role assignments, Reason codes, Security settings, Audit log. Nothing else exists for them yet: that is by design, because no role grants more.
- **Result:** · **Notes:**

##### QA-04 · Must · S1-F01 · A wrong password is refused without saying why
- **Who:** the QA others profile.
- **Do:** Sign in as `SYN-ORG-A` / `syn-approver-a` with a wrong password, **once only** (see QA-80 for why).
- **Expect:** "The Organisation code, login, password or authenticator code is not right." The `Password` field is emptied. The message never says which part was wrong.
- **Result:** · **Notes:**

#### B. Reasons and the first approvals (`S1-F01`)

Every approval needs a reason picked from a list, and the list itself must be approved first. If approve and reject reasons are already in force (for example from the `S1-F14-T04` preparation), still run these cases: they add two more.

##### QA-05 · Must · S1-F01 · Prepare two reasons
- **Who:** A.
- **Do:** Setup › Reason codes › `New reason`. Code `SYN-QA-OK`, Kind "Approve reason", Text "SYNTHETIC QA checked and in order", Starts on today. `Request approval`. Then a second: `SYN-QA-NO`, "Reject reason", "SYNTHETIC QA not right".
- **Expect:** "Sent for approval. A different authorised person decides it from My work." Each row shows the badge "Awaiting approval".
- **Result:** · **Notes:**

##### QA-06 · Must · S1-F01 · You cannot approve your own change
- **Who:** A.
- **Do:** Open `SYN-QA-OK` and press `Open the approval`.
- **Expect:** "You prepared or changed this version, so another person must decide it." No authenticator field and no `Approve` button.
- **Result:** · **Notes:**

##### QA-07 · Must · S1-F01 · A second person approves
- **Who:** P.
- **Do:** My work › `Refresh`. Open the first "Reason list change" with `Open and decide`. Write a reason in `Reason in your own words`, enter a fresh `Authenticator code`, press `Approve`. Do the same for the second.
- **Expect:** "You didn’t prepare this, so you can decide it." before deciding, then "Approved by SYNTHETIC First Approver A · <time>", and the badge changes from "Awaiting approval" to "Approved". A reason-list change is the only kind decided in your own words; every later decision picks `SYN-QA-OK` from a list. Afterwards My work reads "Nothing waiting for you".
- **Result:** · **Notes:**

##### QA-08 · Nice · S1-F01 · A used authenticator code is refused
- **Who:** P, during QA-07's second decision.
- **Do:** Enter the same code you used for the first decision.
- **Expect:** "The authenticator code is not right, or was already used. Enter the new one." Nothing is decided. Wait for the next code and approve.
- **Result:** · **Notes:**

#### C. Opening up the rest of the app (`S1-F01`)

##### QA-09 · Must · S1-F01 · A screen you hold no role for
- **Who:** A.
- **Do:** Type `/setup/organisation-structure` into the address bar.
- **Expect:** The screen's heading shows with a banner "Not available to you", the line "Needs View on Site.", and "Ask an Admin for a role assignment that grants it." The sidebar does not list the screen.
- **Result:** · **Notes:**

##### QA-10 · Must · S1-F01 · Prepare a role that grants everything
- **Who:** A.
- **Do:** Setup › Roles › `New role`. Code `SYN-QA-ALL`, Name "SYNTHETIC QA All-access", Starts on today, Start from "No permissions". In "Permissions", press `All actions` on every row. In the eight restricted-field rows at the bottom (Salary and payroll … Location evidence), tick "view and edit". `Request approval`.
- **Expect:** "Sent for approval…". The role shows "Awaiting approval". It grants nothing yet.
- **Result:** · **Notes:**

##### QA-11 · Must · S1-F01 · Assign it to A and P, and the empty-scope warning
- **Who:** A.
- **Do:** Setup › Role assignments › `New role assignment`. Person "SYNTHETIC First Admin A (syn-admin-a)", Role "SYN-QA-ALL · SYNTHETIC QA All-access". In "Scope", first set Place to `Empty` and read the warning, then set Legal entity, Place and Brand all to `All members`. Starts on today. `Request approval`. Repeat for SYNTHETIC First Approver A.
- **Expect:** With Place empty: "A dimension left empty grants nothing: this assignment would give no access." Both assignments are sent for approval, even though the role itself is still awaiting approval.
- **Result:** · **Notes:**

##### QA-12 · Must · S1-F01 · P approves the role and both assignments
- **Who:** P.
- **Do:** My work › `Refresh`. Approve "Role change", then both "Role assignment change" items, each with Reason `SYN-QA-OK` and a fresh code. Then reload the app in both profiles.
- **Expect:** Each shows "Approved by …". After the reload, A's and P's sidebars hold Home, Money and Setup groups with every screen: Organisation structure, Vocabularies, Products, Devices, Policy readiness and the rest.
- **Note:** P has just approved a role that P will hold. That is allowed today because A prepared it. If you think nobody should approve their own access, mark this **Should exist**.
- **Result:** · **Notes:**

#### D. People (`S1-F01`)

##### QA-13 · Must · S1-F01 · Create three users, with the password rule
- **Who:** A.
- **Do:** Setup › Users › `New user`. Login `syn-accounts-a`, Display name "SYNTHETIC QA Accounts A", Personas held "P-ACC Accounts". Temporary password: first try 8 characters, then one of 12 or more of your own choosing, kept in your password manager. `Request approval`. Then `syn-store-reader-a` ("SYNTHETIC QA Store reader A", "P-AUD Auditor") and `syn-norole-a` ("SYNTHETIC QA No role A", "P-AUD Auditor"). **Do not approve them yet.**
- **Expect:** The short password gives "This password does not meet the password rules. Choose another." and "The password needs at least 12 characters." Each user then shows User state "Not in force yet" and Latest version "Awaiting approval".
- **Result:** · **Notes:**

##### QA-14 · Must · S1-F01 · An Accounts role, assigned before its user is approved
- **Who:** A.
- **Do:** Setup › Roles › `New role`. Code `SYN-QA-ACCOUNTS`, Name "SYNTHETIC QA Accounts". Tick:
  - `All actions` on Account, Book setting, CA approval evidence, Tax rule, Posting map, Financial period, Journal and Period reopening;
  - View and Create on Mapping verification and on Stored file;
  - View on Legal entity, Tax registration, Accounting book, Site, Store, Business unit, Business unit mapping, Approval request and Approval reason.

  `Request approval`. Then assign it to "SYNTHETIC QA Accounts A", all members everywhere, from today.
- **Expect:** Both are sent for approval.
- **Result:** · **Notes:**

##### QA-15 · Must · S1-F01 · An assignment cannot be decided before its user
- **Who:** P.
- **Do:** My work › `Refresh`. Open the "Role assignment change" for SYNTHETIC QA Accounts A **first**.
- **Expect:** "The user this role assignment is for is not approved yet. Decide the user first." Then approve the three "User change" items, the "Role change", and finally the assignment. Each ends "Approved by …". In Users, the three show "Active" and "In force".
- **Result:** · **Notes:**

##### QA-16 · Must · S1-F01 · A user with no role
- **Who:** NR, in the QA others profile.
- **Do:** Sign in as `syn-norole-a` with its temporary password and set up the authenticator and a new password as in QA-02. Then open `/setup/users`. Then `Sign out`.
- **Expect:** "No access assigned": "You are signed in, but you hold no role in force. An Admin must assign you a role before you can use any screen." There is no menu, `/setup/users` shows the same page, and `Sign out` returns to "Sign in".
- **Result:** · **Notes:**

##### QA-17 · Must · S1-F01 · The Accounts user sees exactly their role
- **Who:** AC, in the QA others profile.
- **Do:** First sign-in as `syn-accounts-a`, as in QA-02. Look at the sidebar.
- **Expect:** The sidebar has Money › Internal ledger and trial balance and Period close, and Setup › Organisation structure and Posting maps. It has no Users, Roles or Products. Opening `/setup/users` gives "Not available to you".
- **Result:** · **Notes:**

##### QA-18 · Must · S1-F01 · Who did what is kept
- **Who:** A.
- **Do:** Setup › Role assignments › click "SYNTHETIC QA Accounts A" › tab `History`. Then Setup › Users › `syn-accounts-a` › `History`.
- **Expect:** "Prepared a role assignment" by SYNTHETIC First Admin A, and exactly one "Approved a role assignment" by SYNTHETIC First Approver A with the reason, both on the same version identifier. The user's history has "Approved a user version" once.
- **Result:** · **Notes:**

##### QA-19 · Must · S1-F01 · Sign-ins are recorded
- **Who:** A.
- **Do:** Setup › Audit log › tab `Sign-ins`.
- **Expect:** Newest-first rows with Time, Event, Outcome, User, Network address, Detail. You see "Test sign-in" for the demo buttons, "Sign-in", "Authenticator enrolled" and "Password changed" for the new users, and QA-04's attempt with Outcome "Refused".
- **Result:** · **Notes:**

##### QA-20 · Nice · S1-F01 · A reload in the middle of a decision decides nothing
- **Who:** A prepares, P decides.
- **Do:** A prepares any small change, for example a new reason `SYN-QA-OK2` "SYNTHETIC QA second approve reason". P opens it, picks a reason, types a wrong code, and reloads the page before pressing anything else.
- **Expect:** After the reload the item is still waiting, the code field is empty, and nothing was decided. P then approves it once; its history shows one approval.
- **Result:** · **Notes:**

#### E. Security settings and the idle lock (`S1-F01`)

##### QA-21 · Must · S1-F01 · Change a security setting through approval
- **Who:** A prepares, P approves.
- **Do:** Setup › Security settings. Find "Office session limits" (it shows `1800`). `Prepare a new version`: Idle lock (seconds) `300`, Absolute limit (seconds) `28800`, Where the values come from "Synthetic", Takes effect "From a later day" with Starts on `2020-01-01`. Read the message, then switch to "When approved" and `Request approval`. P approves "Security setting change".
- **Expect:** Three cards: "Sign-in throttling", "Password rules", "Office session limits", each "In force" with its origin. The past date gives "The change must start tomorrow or later." After approval, the Office session limits card shows `300` in force.
- **Result:** · **Notes:**

##### QA-22 · Must · S1-F01 · The idle lock keeps your unsaved work
- **Who:** A (needs A's real password).
- **Do:** Setup › Users › `New user`. Type Login `syn-lock-test`, Display name "SYNTHETIC lock test" and a temporary password. Touch nothing for just over 5 minutes. Unlock first with a wrong password, then with the right one. Then `Cancel` the drawer: do not create this user.
- **Expect:** A dialog "Session locked": "Your unsaved work is kept. Restricted fields and secrets were cleared, so enter them again after you unlock." Behind it, Login and Display name keep their text and Temporary password is empty. The wrong password is refused; the right one returns you to the drawer.
- **Result:** · **Notes:**

##### QA-23 · Nice · S1-F01 · Unsaved work survives a reload while locked
- **Who:** A.
- **Do:** As in QA-22, wait for the lock, then reload the page. Sign in again and open `New user`.
- **Expect:** The reload shows "Sign in", not the lock. Then a banner: "Unsaved input from your last session was kept on this device. Restricted fields were not kept." with `Restore it` and `Discard it`. Restore brings back Login and Display name, not the password. Then `Cancel`.
- **Result:** · **Notes:**

##### QA-24 · Must · S1-F01 · Put the idle lock back
- **Who:** A prepares, P approves.
- **Do:** As QA-21, with Idle lock `1800`, "Synthetic", "When approved".
- **Expect:** The card shows `1800` in force again.
- **Result:** · **Notes:**

#### F. Organisation structure (`S1-F02`)

From here on, "A prepares, P approves" means: A fills the form and presses `Request approval`; P presses `Refresh` in My work, opens the item, picks Reason `SYN-QA-OK`, gives a fresh code and presses `Approve`. Approve each record before preparing the next one that names it.

##### QA-25 · Must · S1-F02 · Geography, one level at a time
- **Who:** A prepares, P approves each.
- **Do:** Setup › Geography and groupings.
  - Countries › `New Country`: `SYN-QA-CO` "SYNTHETIC Country".
  - States › `New State`: Country SYN-QA-CO, `SYN-QA-ST1` "SYNTHETIC State 1".
  - Cities › `New City`: `SYN-QA-CITY1` "SYNTHETIC City 1".
  - Areas › `New Area`: `SYN-QA-AREA1` "SYNTHETIC Area 1".
- **Expect:** Each row goes "Awaiting approval" → "In force". Each next form offers the parent you just approved.
- **Result:** · **Notes:**

##### QA-26 · Must · S1-F02 · Legal entities, registration and books
- **Who:** A prepares, P approves.
- **Do:** Setup › Organisation structure.
  - Legal entities › `New legal entity`: `SYN-QA-LE1` "SYNTHETIC QA Retail Ltd" and `SYN-QA-LE2` "SYNTHETIC QA Wholesale Ltd".
  - Registrations › `New tax registration`: Code `SYN-QA-GST1`, Legal entity SYN-QA-LE1, Registration number `SYNTHETIC-GSTIN-QA-1`, State registered in SYN-QA-ST1, Valid from today.
  - Books › `New accounting book`: `SYN-QA-BK1` "SYNTHETIC QA Book 1" for SYN-QA-LE1, and `SYN-QA-BK2` "SYNTHETIC QA Book 2" for SYN-QA-LE2.
- **Expect:** All in force. The registration number is kept exactly as typed: stage 1 does not check GSTIN format.
- **Result:** · **Notes:**

##### QA-27 · Must · S1-F02 · A Site, and its dates rule
- **Who:** A prepares, P approves.
- **Do:** Sites › `New Site`: `SYN-QA-SITE1` "SYNTHETIC QA Site 1", Physical kind "Retail site", Area SYN-QA-AREA1. First set a Closing date before the Opening date, then fix it: Opening date today, Closing date empty.
- **Expect:** The bad dates are refused at the Closing date field (the rule is that a closing date is never before the opening date; the field may only say "This is not allowed here."). After approval the Site shows "Setting up" and "In force".
- **Result:** · **Notes:**

##### QA-28 · Must · S1-F02 · Two Stores
- **Who:** A prepares, P approves.
- **Do:** Stores › `New Store`: `SYN-QA-STORE1` "SYNTHETIC QA Store 1", Format EBO, Operating model Company-owned, Site SYN-QA-SITE1. Then `SYN-QA-STORE2` "SYNTHETIC QA Store 2", MBO, Franchise-owned, same Site.
- **Expect:** Both in force, "Setting up".
- **Result:** · **Notes:**

##### QA-29 · Must · S1-F02 · A business unit, and its mapping must stay in one company
- **Who:** A prepares, P approves.
- **Do:** Business units › `New business unit`: Code `SYN-QA-BU1`, Site SYN-QA-SITE1, Kind Whole store, Store SYN-QA-STORE1, Name "SYNTHETIC QA Store 1 whole store", Legal entity SYN-QA-LE1, Tax registration SYN-QA-GST1, Accounting book **SYN-QA-BK2**. Request approval and read the message. Then change the book to SYN-QA-BK1 and request again. P approves "Business unit change".
- **Expect:** With BK2: "The tax registration or the book belongs to another legal entity than the mapping's. Choose a registration and a book of that legal entity." With BK1 it goes through and is approved. The unit and its mapping are approved together.
- **Result:** · **Notes:**

##### QA-30 · Nice · S1-F02 · One whole-store unit per Store
- **Who:** A.
- **Do:** Try a second unit `SYN-QA-BU1B`, Whole store, Store SYN-QA-STORE1, same company, registration and book.
- **Expect:** "This Store already has its whole-store unit at this Site. Add a brand-counter unit instead." (It may appear when you request, or when P decides.)
- **Result:** · **Notes:**

##### QA-31 · Must · S1-F02 · Mapping verified by someone else, with evidence
- **Who:** A, then AC.
- **Do:** A: Organisation structure › Mappings › `SYN-QA-BU1` › Versions › `Verify mapping`, choose `SYNTHETIC-qa-evidence.pdf`, `Verify with this evidence`. Then AC does the same.
- **Expect:** For A: "You made this mapping, so you cannot verify it. A different person with the verify permission verifies it." For AC: "Mapping verified", and the version shows "Verified <time>" and the file's name.
- **Result:** · **Notes:**

##### QA-32 · Must · S1-F02 · A location
- **Who:** A prepares, P approves.
- **Do:** Locations › `New location`: `SYN-QA-LOC1`, Site SYN-QA-SITE1, Business unit SYN-QA-BU1, Name "SYNTHETIC QA shop floor", Kind Floor.
- **Expect:** In force.
- **Result:** · **Notes:**

##### QA-33 · Nice · S1-F02 · A warehouse unit and a Store's default warehouse
- **Who:** A prepares, P approves.
- **Do:** Business units › `New business unit`: `SYN-QA-WH1`, Site SYN-QA-SITE1, Kind Warehouse, Store "None", "SYNTHETIC QA back store", SYN-QA-LE1 / SYN-QA-GST1 / SYN-QA-BK1. After approval: Default warehouses › SYN-QA-STORE1 › `Prepare a new version`, Warehouse unit SYN-QA-WH1. Then try the same with SYN-QA-BU1 as the warehouse.
- **Expect:** The warehouse unit is approved. A whole-store unit as default warehouse is refused: "A default warehouse is a warehouse business unit. Choose a warehouse unit."
- **Result:** · **Notes:**

##### QA-34 · Nice · S1-F02 · A classification for Stores
- **Who:** A prepares, P approves.
- **Do:** Classification kinds › `New classification kind`: `SYN-QA-BAND`, Classifies Stores, "SYNTHETIC Store size band". Classification values › `New classification value`: kind SYN-QA-BAND, `SYN-QA-BAND-L` "SYNTHETIC Large". Then open `New Store` and look, but press `Cancel`.
- **Expect:** The Store form now has a dropdown "SYN-QA-BAND · SYNTHETIC Store size band" with "None" and "SYNTHETIC Large".
- **Result:** · **Notes:**

##### QA-35 · Nice · S1-F02 · A grouping of Stores
- **Who:** A prepares, P approves.
- **Do:** Organisation structure › Grouping kinds › `New grouping kind`: `SYN-QA-GK` "SYNTHETIC QA region". Geography and groupings › Groupings › `New grouping`: `SYN-QA-GRP1`, Kind SYN-QA-GK, "SYNTHETIC QA North", tick both Stores.
- **Expect:** Both in force; the grouping lists the two Stores.
- **Result:** · **Notes:**

##### QA-36 · Must · S1-F02 · Master lists
- **Who:** A.
- **Do:** Organisation structure › Master lists, In force on today.
- **Expect:** A table (Record, Code, Name, Status) listing everything above, with an "as of" time. The SYN-QA-BU1 mapping row reads "Verified".
- **Result:** · **Notes:**

#### G. Access limited to one Store (`S1-F02`)

##### QA-37 · Must · S1-F02 · Assign a role for one Store only
- **Who:** A prepares, P approves.
- **Do:** Roles › `New role`: `SYN-QA-STORE-READ` "SYNTHETIC QA Store reader", View on Site, Store, Business unit and Location. Role assignments › `New role assignment`: Person SYNTHETIC QA Store reader A, Role SYN-QA-STORE-READ, Legal entity All members, Brand All members, Place `Selected members` → tick "Store SYN-QA-STORE1 · SYNTHETIC QA Store 1". P approves both.
- **Expect:** The form explains: "Places form one tree. A selected Site covers its Stores and business units, including ones added later; a selected Store covers its business units, including ones added later." The table shows the scope as "Legal entity: All members · Place: 1 selected · Brand: All members".
- **Result:** · **Notes:**

##### QA-38 · Must · S1-F02 · The Store reader sees only their Store
- **Who:** SR, in the QA others profile.
- **Do:** First sign-in as `syn-store-reader-a`. Organisation structure › Stores.
- **Expect:** Only SYN-QA-STORE1 is listed. SYN-QA-STORE2 is not. The sidebar has My work and Organisation structure only. No New or Change buttons work for SR.
- **Result:** · **Notes:**

#### H. Products (`S1-F03`)

##### QA-39 · Must · S1-F03 · Attributes are saved directly
- **Who:** A.
- **Do:** Setup › Vocabularies › Attributes › `New attribute`: `SYN-QA-COLOUR` "SYNTHETIC Colour", Values "From its approved list". `Save`. Then `SYN-QA-FIT` "SYNTHETIC Fit", "Written as text".
- **Expect:** "Saved. It takes effect from its start date." No approval is asked: catalogue building blocks are saved directly. A new tab "SYNTHETIC Colour" appears; Fit gets no tab.
- **Result:** · **Notes:**

##### QA-40 · Must · S1-F03 · A new value needs someone else to confirm it
- **Who:** A proposes; A then P decide.
- **Do:** Vocabularies › SYNTHETIC Colour tab › Proposals › `Propose a value`: `SYN-QA-RED` "SYNTHETIC Red". `Request approval`. A opens the proposal's approval. Then P confirms "Vocabulary value confirmation" from My work.
- **Expect:** "A proposed value is not used anywhere until a different person confirms it from My work." A is refused with "You prepared or changed this version, so another person must decide it." After P confirms, Approved values lists "SYNTHETIC Red" in force.
- **Result:** · **Notes:**

##### QA-41 · Must · S1-F03 · Brand, category and size set
- **Who:** A.
- **Do:** Vocabularies:
  - Brand › `New brand`: `SYN-QA-BRAND` "SYNTHETIC QA Brand".
  - Sub category › `New category`: `SYN-QA-CAT` "SYNTHETIC QA Shirts", tick SYNTHETIC Colour as an attribute of a SKU's identity.
  - Size › `New size set`: `SYN-QA-SIZES`, Category SYN-QA-CAT, "SYNTHETIC QA shirt sizes", sizes `S`, `M`, `L` one per line.

  `Save` each. These codes must be exactly as written: the sample product files use them.
- **Expect:** Each "Saved. It takes effect from its start date."
- **Result:** · **Notes:**

##### QA-42 · Must · S1-F03 · Propose a product; someone else confirms it
- **Who:** A proposes, P confirms.
- **Do:** Setup › Products › Proposals › `Propose a product`. "A new style": Code `SYN-QA-STYLE-10`, Brand SYN-QA-BRAND, Category SYN-QA-CAT, Fit "SYNTHETIC slim". SKU 1: Code `SYN-QA-SKU-10-RED`, Size leave "Unknown", Colour SYNTHETIC Red, Stock unit Piece, Purpose Merchandise. `Request approval`. A tries its approval, then P confirms "Product confirmation".
- **Expect:**
  - The Size list offers only "Unknown" today. The size set is not attached to the category until a later version (QA-43), and Unknown is a valid answer, never a default.
  - The proposal shows "Proposed". A is refused.
  - After P confirms, Styles lists SYN-QA-STYLE-10 and SKUs lists SYN-QA-SKU-10-RED, in force.
- **Result:** · **Notes:**

##### QA-43 · Nice · S1-F03 · Next day: sizes from the category's size set
- **Who:** A, then P. Needs two days.
- **Do:** Day 1: Vocabularies › Sub category › SYN-QA-CAT › `Prepare a new version`, Size set SYN-QA-SIZES, Starts on **tomorrow**. Day 2: propose SKUs of the existing style SYN-QA-STYLE-10: `SYN-QA-SKU-10-RED-M` with Size M and Colour Red. P confirms. Then try a second SKU with the same Size M and Colour Red.
- **Expect:** Day 2's Size list shows S, M, L. The duplicate gives "The style already has a SKU of this size and identity."
- **Result:** · **Notes:**

##### QA-44 · Must · S1-F03 · An outside code for a SKU keeps its leading zeros
- **Who:** A.
- **Do:** Products › Barcodes and aliases › `Map a code`: Code `0009876543210`, Kind Supplier barcode, Scope The whole Organisation, SKU SYN-QA-SKU-10-RED, Unit "The stock unit", Starts on today. `Save`. Then map the same code again, to the same SKU, from today.
- **Expect:** The code is listed exactly as `0009876543210`. The second mapping is refused: "This code already names another SKU or unit in an overlapping scope and dates."
- **Result:** · **Notes:**

##### QA-45 · Nice · S1-F03 · Tracking profile and a pack
- **Who:** A.
- **Do:** Setup › Merchandise tracking profiles.
  - Tracking profiles › `New tracking profile`: `SYN-QA-TP1` "SYNTHETIC QA simple", nothing ticked, shelf lives empty.
  - Category profiles › SYN-QA-CAT › `Prepare a new version`, Tracking profile SYN-QA-TP1.
  - Packs › `New pack`: `SYN-QA-PACK3`, SKU SYN-QA-SKU-10-RED, Stock units in a pack 3, tick neither Purchasing pack nor Selling pack, `Save`. Then tick Purchasing pack and `Save`.
- **Expect:** Empty shelf lives show as Unknown, not 0. The pack with neither box ticked is refused ("This is not allowed here."), then saved with Purchasing ticked.
- **Result:** · **Notes:**

#### I. Suppliers, bank details and agreements (`S1-F03`)

##### QA-46 · Must · S1-F03 · A supplier and its brand
- **Who:** A.
- **Do:** Setup › Suppliers and agreements › `New party`: `SYN-QA-SUP1`, Legal name "SYNTHETIC QA Supplier Pvt Ltd", Tax identity numbers `GSTIN: SYNTHETIC-GSTIN-QA-SUP`, MSME classification Unknown, Roles Supplier. `Save`. Brands and suppliers › `Link a brand and a supplier`: SYN-QA-BRAND with SYN-QA-SUP1, Linked from this date ticked, today.
- **Expect:** The party is saved, and the link shows "Linked".
- **Result:** · **Notes:**

##### QA-47 · Must · S1-F03 · Bank details stay masked and need a second person
- **Who:** A prepares, P approves, then either reveals.
- **Do:** Open SYN-QA-SUP1 › Bank details › `Change bank details`: Account holder "SYNTHETIC QA Supplier", Account number `SYN000111222`, IFSC `SYNQ0000001`, Bank "SYNTHETIC Bank", Starts on today, and a fresh code. `Request approval`. A opens its approval. P approves "Bank details change". Then, on the approved version, `Show bank details` with a fresh code, then `Hide`.
- **Expect:**
  - "Bank details are restricted. They show masked until you show them with a fresh authenticator code, which is recorded."
  - The version shows "•••• masked", even to A who typed it. A's own approval is refused.
  - After approval, Show reveals the four values, and Hide masks them again.
  - Setup › Audit log › `Sensitive access` lists the reveal.
- **Result:** · **Notes:**

##### QA-48 · Must · S1-F03 · A dated agreement with its signed copy
- **Who:** A prepares, P approves.
- **Do:** Setup › Agreement › `New agreement`: Code `SYN-QA-AGR1`, With "A supplier", Supplier SYN-QA-SUP1. Set only Commercial model to "Outright" and leave every other term as it is. Signed agreement `SYNTHETIC-qa-evidence.pdf`. Starts on today. `Request approval`. P approves "Agreement version". Then choose SYN-QA-AGR1 in the `Agreement` list.
- **Expect:** The form says "Left empty, a term is Unknown. Nothing is filled in for you." After approval the terms in force today show Commercial model Outright, every other term Unknown, and "1 signed agreement file".
- **Result:** · **Notes:**

##### QA-49 · Nice · S1-F03 · One agreement per supplier
- **Who:** A.
- **Do:** `New agreement` again with Supplier SYN-QA-SUP1.
- **Expect:** "This brand or supplier already has an agreement. Prepare a new version of it instead."
- **Result:** · **Notes:**

#### J. Approval authority (`S1-F05`)

##### QA-50 · Nice · S1-F05 · The approval limits form
- **Who:** A.
- **Do:** Setup › Approval limits › `New approval limit`. Open the `Action` list and write down what it offers.
- **Expect:** The screen opens. The Action list is expected to be empty or nearly so, because no approval with a money value exists until stage 2 (section 2.2). If it offers an action, choose "No value authority" with `Also covers an unknown value` unticked: "A limit with no value authority must cover an unknown value, or it grants nothing." `Cancel` either way.
- **Result:** · **Notes:**

##### QA-51 · Nice · S1-F05 · Nobody stands in for themselves
- **Who:** A.
- **Do:** My work › `Delegate during absence`. Stand-in and Standing in for both "SYNTHETIC First Admin A". Write down what the `Action` list offers. Fill the rest, with Ends on next week. `Request approval`.
- **Expect:** "A person can’t stand in for themselves." `Cancel`.
- **Result:** · **Notes:**

#### K. Exceptions and operations (`S1-F08`, `S1-F14`)

##### QA-52 · Must · S1-F08 · An exception rule through approval
- **Who:** A prepares, P approves.
- **Do:** Setup › Exception rules › `Prepare a rule`: Type "Unfinished operation …", Site "No Site (the Organisation as a whole)", Owner is A person, Owner SYNTHETIC QA Accounts A, Due after (minutes) `240`, Escalates to SYNTHETIC First Approver A, Starts on today, Where the values come from SYNTHETIC. `Request approval`. P approves "Exception rule change".
- **Expect:** The rule is listed in force, beside any rule `S1-F14-T04` added for recovery gaps. There is no button to raise an exception by hand: section 2.2.
- **Result:** · **Notes:**

##### QA-53 · Must · S1-F14 · Backups show on the Operations view
- **Who:** A.
- **Do:** Setup › Operations view.
- **Expect:** Three sections: "Recovery after a restore", "Backups", "Failed jobs". Backups lists the backup(s) of the `S1-F14-T04` drill as "Completed", with "Last complete backup taken from the data as it was at <time>." Failed jobs reads "No failed jobs" or lists jobs; write down any you see.
- **Result:** · **Notes:**

#### L. Policies and readiness (`S1-F04`)

##### QA-54 · Must · S1-F04 · Every policy starts open, and what it blocks is named
- **Who:** A.
- **Do:** Setup › Policy readiness.
- **Expect:** 19 policies, "Policy 1 · Commercial ownership" to "Policy 19 · Offers and promotions". Each has Status "Open" and Values "Not validated". Under "What is blocked", opening-data publishing shows "Live action unavailable", "3 things are missing":
  - "The capability Opening-data publishing is switched off."
  - "Policy 14 · Opening and cutover is not signed."
  - "Policy 14 · Opening and cutover: its real values are not validated by a person who did not enter them."
- **Note:** if a policy shows Signed already, write down which: on `dev` nothing should be signed before this QA.
- **Result:** · **Notes:**

##### QA-55 · Must · S1-F04 · Sign policy 14; validating it is refused; switching on is not enough
- **Who:** A, then P.
- **Do:** Open policy 14. `Record as Signed`: Signed by "SYNTHETIC QA signatory", Signed on today, Origin SYNTHETIC, Evidence file `SYNTHETIC-qa-evidence.pdf`. Then P tries `Record as validated` (Origin SYNTHETIC, the same file). Then A, in "What it governs", presses `Switch on`, reads the blocked list, and presses `Switch off`.
- **Expect:**
  - Policy 14 shows the badge "Signed", with who signed and the file.
  - Validating is refused: "No part of the system reports values of this policy yet, so there is nothing to validate." This is expected in stage 1 (section 2.2).
  - After `Switch on`, opening-data publishing is still unavailable, with one thing missing: the validation. Switching a capability on never bypasses a policy.
- **Note:** signing cannot be undone. It is synthetic, on `dev` only.
- **Result:** · **Notes:**

##### QA-56 · Nice · S1-F04 · The person who entered a policy's values cannot validate them
- **Who:** A, then P.
- **Do:** Sign policy 2 as in QA-55. A tries `Record as validated`. Then P does.
- **Expect:** A prepared security settings and an exception rule (QA-21, QA-52), which are policy 2 values, so A is refused: "You entered some of this policy's values, so you cannot validate them. A person who did not enter them does." P validates, and Values shows "Validated".
- **Result:** · **Notes:**

##### QA-57 · Must · S1-F04 · Site readiness checks say what is missing
- **Who:** A.
- **Do:** Setup › Site opening and closure, Business unit SYN-QA-BU1. In "Opening stock", tick "This unit genuinely holds no stock" and press `Record the declaration`. Press `Run the checks` in the Receiving section and in the Site readiness card for Receiving.
- **Expect:**
  - "Declared to hold no stock by SYNTHETIC First Admin A, <time>."
  - The unit's checks: Mappings Passed (verified in QA-31), Locations Passed, Stock plan Passed. Site readiness Fails with "The Site is not made ready for Receiving yet: its shared checks must pass and a different person approve them."
  - The Site's check "Required policies" Fails with "No action of this activity is built yet, so there is nothing to make ready."
  - No `Ask for approval` appears. Receiving arrives in stage 2, so this is the right answer today.
- **Result:** · **Notes:**

#### M. Tills and bill numbers (`S1-F12`)

##### QA-58 · Must · S1-F12 · A financial year through approval
- **Who:** A prepares, P approves.
- **Do:** Setup › Devices, tills and bill series › Financial years › `Define a financial year`: Year label `SYN-QA-FY1`, First day `2026-04-01`, Last day `2027-03-31`, Where the values come from "Synthetic". `Request approval`. P approves "Financial year".
- **Expect:** "SYN-QA-FY1: 1 Apr 2026 to 31 Mar 2027" in force. These dates are synthetic test values, not a KDPS setting.
- **Result:** · **Notes:**

##### QA-59 · Must · S1-F12 · A bill-number format must name the till
- **Who:** A prepares, P approves.
- **Do:** Bill-number format › `Prepare a new format`: Format code `SYN-QA-BILLFMT`, "Synthetic". Parts: Fixed text `SYN/`, Sequence number with 5 digits. `Request approval`. Then insert a Device code part and a Fixed text `/` part, so the parts read: `SYN/`, Device code, `/`, Sequence number (5). Request again. P approves "Bill-number format".
- **Expect:** Without the device code: "A bill-number format must show the device code, so two devices never give the same number." The preview then reads `SYN/‹device code›/‹5-digit number›`. After approval: "In force: SYN-QA-BILLFMT".
- **Result:** · **Notes:**

##### QA-60 · Must · S1-F12 · Register a till
- **Who:** A.
- **Do:** Billing devices › Register: Device code `SYN-QA-TILL1`, Label "SYNTHETIC QA Till 1", Store SYN-QA-STORE1, tick unit SYN-QA-BU1. `Register device`. Then register another with the code `syn-qa-till1`.
- **Expect:** "Registered. Enrol it in the counter app on the device." The row shows "Setting up" and "Its bill series are defined when it is enrolled." The second, differing only in case, is refused: "Another device already has this code."
- **Result:** · **Notes:**

##### QA-61 · Must · S1-F12 · Enrol the till in the counter app
- **Who:** A, in the **QA counter** profile.
- **Do:** Open `/counter/`. Sign in with `SYN-ORG-A`, `syn-admin-a`, A's real password and a code. Choose Device "SYN-QA-TILL1 · SYNTHETIC QA Till 1". Wait for the **next** code and enter it in `Fresh authenticator code`. `Enrol this browser`. Then refresh the web Devices screen in the QA admin profile.
- **Expect:**
  - "Enrol this browser as a billing device", then "Signed in as SYNTHETIC First Admin A."
  - "This browser is now device SYN-QA-TILL1." with "Bill series: 1".
  - The web row shows "Active" and "Bill series for SYN-QA-GST1, SYN-QA-FY1" with "Open".
- **Result:** · **Notes:**

##### QA-62 · Must · S1-F12 · Sign in on the till
- **Who:** A, QA counter profile.
- **Do:** Reload `/counter/`. Sign in with login, password and code.
- **Expect:** "Sign in on device SYN-QA-TILL1", then "Signed in on device SYN-QA-TILL1: a shared POS session." There is no billing screen yet (stage 4).
- **Result:** · **Notes:**

##### QA-63 · Nice · S1-F12 · Replace a lost till
- **Who:** A.
- **Do:** Devices › SYN-QA-TILL1 › Replace: The old device "Revoke it: it is lost", New device code `SYN-QA-TILL2`, label "SYNTHETIC QA Till 2", `Replace device`. Then reload `/counter/` in the QA counter profile and try to sign in.
- **Expect:** TILL1 shows "Revoked". TILL2 shows "Setting up", with "Replaces an earlier device. It gets fresh bill series when it is enrolled; the old ones stay closed." The counter refuses TILL1: write down the exact words.
- **Result:** · **Notes:**

##### QA-64 · Nice · S1-F12 · Retire a till
- **Who:** A.
- **Do:** Devices › SYN-QA-TILL2 › `Retire`, confirm with `Retire device`.
- **Expect:** TILL2 shows "Ended". Its actions are gone.
- **Result:** · **Notes:**

##### QA-65 · Nice · S1-F12 · Overlapping financial years are refused
- **Who:** A.
- **Do:** `Define a financial year`: `SYN-QA-FY2`, 2026-10-01 to 2027-09-30, Synthetic. `Request approval`.
- **Expect:** "This financial year overlaps another." (when you request, or when P decides).
- **Result:** · **Notes:**

##### QA-66 · Nice · S1-F12 · The counter opens in Edge
- **Who:** anyone, in Microsoft Edge.
- **Do:** Open `/counter/`. Do not enrol.
- **Expect:** "Enrol this browser as a billing device" with its sign-in form, as in Chrome.
- **Result:** · **Notes:**

#### N. File intake (`S1-F06`)

##### QA-67 · Must · S1-F06 · A saved layout, confirmed by someone else
- **Who:** A proposes, P confirms.
- **Do:** Setup › File intake and saved layouts › Saved layouts. It reads "No saved layout". `Propose a layout`: Code `SYN-QA-PRODUCT-LAYOUT`, Source "SYNTHETIC product file", Document type `product-master`, and paste into Structure:

  ```json
  {"shape":"layout-version/1","format":"xlsx","sheet":"SYNTHETIC Products","headerRow":1,"dataStartRow":2,"columns":[{"name":"Style code","required":true},{"name":"SKU code","required":true},{"name":"Brand code","required":true},{"name":"Category code","required":true},{"name":"Size","required":false},{"name":"Stock unit","required":true},{"name":"Purpose","required":true}],"documentReference":"Style code"}
  ```

  First paste it with one bracket deleted to see the message, then paste it whole. `Request approval`. P confirms "Layout version confirmation".
- **Expect:** The broken one gives "This is not a valid structure. Check the names and the brackets." The layout then shows Proposed, and after P, Confirmed.
- **Result:** · **Notes:**

##### QA-68 · Must · S1-F06 · A mapping for the layout
- **Who:** A proposes, P confirms.
- **Do:** Open the layout version › `Propose a mapping`: Code `SYN-QA-PRODUCT-MAPPING`, Target `merchandise`, and paste into Fields:

  ```json
  {"shape":"mapping-version/1","fields":{"styleCode":{"column":"Style code","transform":"text"},"skuCode":{"column":"SKU code","transform":"text"},"brandCode":{"column":"Brand code","transform":"text"},"categoryCode":{"column":"Category code","transform":"text"},"size":{"column":"Size","transform":"text"},"stockUnit":{"column":"Stock unit","transform":"text"},"purpose":{"column":"Purpose","transform":"text"}}}
  ```

  First try it with `styleCode` changed to `styleKode`. `Request approval`. P confirms "Mapping version confirmation".
- **Expect:** The wrong field gives "The mapping fills a field the target does not have." The right one is confirmed.
- **Result:** · **Notes:**

##### QA-69 · Must · S1-F06 · Upload: stored, recognised, but the import cannot start yet
- **Who:** A.
- **Do:** Intake › `Upload` `SYNTHETIC-qa-products-1.xlsx`. Look at the layout choice. Press `Start the import`.
- **Expect:**
  - "The file is stored." with Type "Excel workbook (XLSX)", Size and Content hash.
  - "One saved layout matches this file. It is chosen below."
  - Start is refused: "Imports cannot start: no number series gives batch codes yet." with "An open number series for import batch codes." This is the expected stage 1 answer (section 2.2).
- **Result:** · **Notes:**

##### QA-70 · Must · S1-F06 · The same file twice is recognised
- **Who:** A.
- **Do:** Upload `SYNTHETIC-qa-products-1.xlsx` again.
- **Expect:** "These same bytes were stored before: this upload added a receipt to the stored copy."
- **Result:** · **Notes:**

##### QA-71 · Must · S1-F06 · A workbook with a macro is refused
- **Who:** A.
- **Do:** Upload `SYNTHETIC-qa-macro.xlsx`.
- **Expect:** "This workbook holds macros, controls or embedded objects, so it was not stored. Save it as a plain Excel workbook (.xlsx) without them and upload it again." and "Macros." Nothing is stored.
- **Result:** · **Notes:**

##### QA-72 · Must · S1-F06 · A file that is not a workbook is refused
- **Who:** A.
- **Do:** Upload `SYNTHETIC-qa-not-a-workbook.xlsx`.
- **Expect:** "This file is not of a type allowed here, so it was not stored: an Excel workbook (.xlsx) for an import, a PDF, JPEG or PNG for evidence." The type is read from the file's content, not its name.
- **Result:** · **Notes:**

##### QA-73 · Nice · S1-F06 · A second file with a new style
- **Who:** A.
- **Do:** Upload `SYNTHETIC-qa-products-2.xlsx`.
- **Expect:** Stored as a new file, not a repeat, and the same layout matches.
- **Result:** · **Notes:**

##### QA-74 · Nice · S1-F06 · A mapping rule for a word in the file
- **Who:** A proposes, P confirms.
- **Do:** Mapping rules › `Propose a mapping rule`: Attribute `merchandise.brandCode`, Scope Whole Organisation, Word in the file `qa brand`, Capital letters matter unticked, Approved value `SYN-QA-BRAND`, From today. `Request approval`. A opens it; P confirms "Mapping rule confirmation".
- **Expect:** Proposed. A is refused. After P, it shows "In force".
- **Result:** · **Notes:**

##### QA-75 · Nice · S1-F06 · Outcomes and Comparisons start empty
- **Who:** A.
- **Do:** Open the Outcomes and Comparisons tabs.
- **Expect:** Outcomes: "No import batch". Comparisons: "No comparison run", with an empty "Opening manifest" list (section 2.2).
- **Result:** · **Notes:**

##### QA-76 · Nice · S1-F08 · Evidence on an approval decision
- **Who:** A prepares, P approves.
- **Do:** A prepares any small change, for example reason `SYN-QA-OK3` "SYNTHETIC QA third approve reason". P approves it with `Evidence file (optional)` set to `SYNTHETIC-qa-photo.jpg`.
- **Expect:** The decision is recorded with the photo, shown as a JPEG photograph with its size, and it opens.
- **Result:** · **Notes:**

#### O. Finance screens (`S1-F09`)

##### QA-77 · Nice · S1-F09 · Finance screens open, with nothing to show yet
- **Who:** AC.
- **Do:** Setup › Posting maps, Book SYN-QA-BK1, then `Prepare a map version` and open the Debit account list, then `Cancel`. Money › Period close, Book SYN-QA-BK1. Money › Internal ledger and trial balance.
- **Expect:**
  - Posting maps: "No posting maps in this book yet", and the account lists are empty, because accounts are API only (section 2.2).
  - Period close: "No periods in this book yet".
  - Internal ledger: "Choose a book and a period".
- **Result:** · **Notes:**

#### P. One Organisation never sees another (`S1-F01`, `S1-F02`)

##### QA-78 · Must · S1-F01 · ORG-B sees none of ORG-A
- **Who:** the QA others profile, demo button "SYNTHETIC First Admin B".
- **Do:** Open Users, Roles and Role assignments.
- **Expect:** Only `syn-admin-b` and `syn-approver-b`, only ORG-B's two starting roles, and none of the SYN-QA users or roles. The sidebar holds only the access screens.
- **Result:** · **Notes:**

##### QA-79 · Must · S1-F01 · An ORG-A login does not work in ORG-B
- **Who:** the QA others profile, signed out.
- **Do:** Sign in with Organisation code `SYN-ORG-B`, login `syn-accounts-a`, AC's real password and a code. Once only.
- **Expect:** "The Organisation code, login, password or authenticator code is not right."
- **Result:** · **Notes:**

#### Q. Last: sign-in throttling (`S1-F01`)

Run this last. Failures are counted per login **and per network address**, so for about 10 minutes after it, every sign-in from your network may be slowed.

##### QA-80 · Must · S1-F01 · Too many wrong passwords slow sign-in
- **Who:** NR, in the QA others profile.
- **Do:** Sign in as `syn-norole-a` with a wrong password 5 times. Then try the right password and a code. Wait 10 minutes and try the right one again.
- **Expect:**
  - Five times: "The Organisation code, login, password or authenticator code is not right."
  - Then, even with the right password: "Too many attempts failed. Wait a while, then try again." with a reference.
  - After 10 minutes the right password works, and NR reaches "No access assigned".
- **Result:** · **Notes:**

### 2.4 After you finish

- Leave everything you created on `dev`. It is synthetic, and stage 2 testing can reuse it.
- Tell Claude the cases are filled in. Every Fail and Should exist is then triaged into one of: a fix ticket in its feature folder; a question in [open-items.md](../../plan/open-items.md); or "works as designed", with the reason written next to the case.
