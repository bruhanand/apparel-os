# S1-F12-T01 — Register and enrol a billing device

Status: blocked
Blocked by: S1-F02-T02 (Stores and their whole-store and brand-counter units); S1-F08-T01 (number series); S1-F01-T09 (session kinds and the fresh-code check); S1-F11-T10 (`apps/counter` exists, with its Playwright run)
Feature: [S1-F12 Billing devices and device bill series](../../spec.md)

## Build

A billing device registered in the back office, enrolled in the counter app with a key that never leaves the browser, proved at sign-in, and given its bill series ([offline-counter.md](../../../../design/pos/offline-counter.md) (GC-8) sections 3 and 4, 5.1 to 5.3, 12; sections 3 to 5 and 11 approved by the product owner on 6 Oct 2026).

- **The device record** (3.1, 12.3; access-and-approvals 2.4): `access.device` with versions: a code unique in the Organisation, the public key set once at enrolment and never changed, and its state, Setting up or Active here (Revoked and Ended come with S1-F12-T02). `pos.billing_device` (its Store, fixed for life) and `pos.billing_device_unit` (dated: only whole-store and brand-counter units of that Store). Its registrations are those of its units' mappings in force, never chosen apart (`PRD-ORG-005`).
- **Register** (3.2 step 1, 12.1): in the back office, an authorised person creates the device with code, label, Store and units; it is Setting up. The permission comes only through a role assignment (`POL-02.03`); no independent approval. A unit of another Store, or an office or warehouse unit, is refused. Event `pos.device-registered`.
- **Enrol** (3.2 steps 2 and 3): at `/counter/`, in `apps/counter`, an authorised person signs in and enrols this browser for the device, giving a fresh authenticator code (GC8-8, approved by the product owner 6 Oct 2026; access-and-approvals 3.3). The page generates an ECDSA key pair on curve P-256 with WebCrypto, the private key non-extractable, kept in the counter's IndexedDB through Dexie (5.3; Stack row Counter), and signs a one-time server challenge. The server checks challenge and signature, binds the public key, makes the device Active, and in the same transaction writes its audit record and access record and has `pos` define its series where it can (`PRD-ACS-013`, `PRD-SEC-007`, `PRD-INT-004`). A second enrolment of the device is refused. Event `pos.device-enrolled`.
- **Device bill series** (4.1; numbering-and-audit 3.4; `PRD-POS-020`, `PRD-OFF-002`, `DEC-005`): one Open series per registration of the device's units, for the current financial year, defined through `numbering` with a scope key for device and registration; a second live series for the same device, registration and year is refused by `numbering`. A series needs a format and the financial year's dates, both Organisation settings with no default; tests use labelled synthetic values. Enrolment with no bill format or no financial-year dates still succeeds and defines no series; the devices readiness check of S1-F12-T02 then fails naming what is missing (GC-8 4.1 and test 8; product owner, 6 Oct 2026, DEC-116).
- **Prove the device** (3.3, 3.4; `PRD-OFF-010`): the device signs a fresh server challenge. At sign-in on the device, with the Organisation code, login, password and authenticator code, a valid proof gives a shared POS session bound to the device; without one the session is an office session (`POL-02.18`; access-and-approvals 3.3). An unknown key's proof is refused.
- **Screens**: Setup › Devices, tills and bill series in `apps/web` (register; devices with their state, units and series); the enrolment and device sign-in pages in `apps/counter`. Browser tests of the counter live in `apps/counter/e2e/` (approved 6 Oct 2026).
- **Design text**: unless the stage spec's documents step has done it, mark GC-8 sections 3 to 5 and 11 approved (6 Oct 2026), with `apps/counter`, the fresh code at enrolment and browser tests in the counter app, and align 12.1 with 4.1 and test 8 (enrolment without a format or financial-year dates succeeds), before this code.

When an approved change defines the bill format or the financial-year dates, the same change creates the missing series for every Active device without one; it is retry-safe and never replaces, renumbers or resets an existing series (offline-counter 4.1; `DEC-117`).

## Expected outputs

- Devices in `access`; billing devices and units in `pos`; series defined through `numbering`
- The back-office devices screen; the counter's enrolment and sign-in pages; tests on the server and in `apps/counter/e2e/`

## Done when

- GC-8 14.1 tests 1, 2, 4 and 11 pass
- numbering-and-audit 7 tests 2 and 3 pass for device series: concurrent allocations on one device series get distinct, consecutive numbers while two device series never wait for each other; a second open series for the same device, registration and year is refused
- The parts of GC-8 tests 3 and 10 that need no revocation pass: a second enrolment and a proof signed by another key are refused; registration and enrolment each write an audit record and an access record and commit with them or not at all. Both tests pass whole in S1-F12-T02
- Enrolment without a fresh authenticator code is refused
- Enrolment with no bill format or no financial-year dates succeeds and defines no series
- The Admin's browser journey on the devices screen covers registration and its refusals with their reasons (GC-8 test 12 passes whole in S1-F12-T02)

A device enrolled before the format and year exist gets its series when the approving change commits; repeating the change creates none twice; an existing series is untouched (`DEC-117`)

## Notes

- GC8-7 answered: the device state names Setting up, Active, Ended and Revoked are approved, so the devices screen need not wait (product owner, 6 Oct 2026, DEC-116).
- GC-8 4.1 and test 8 win over 12.1: enrolment without a format or financial-year dates succeeds, defines no series, and the devices check fails naming what is missing (product owner, 6 Oct 2026, DEC-116).
- GC8-8: the KDPS Owner confirms the fresh code at enrolment for live use (it adds to the GC3-6 list).
- Live gates: the financial-year dates (GC5-1, RR-060), the bill-number format (V-40, RR-101), and policy 2 for live session limits.
- Every stage 1 device is an online till. The offline counter designation and GC-8 sections 6 to 10 stay Draft for `S4-F11`.
