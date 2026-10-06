# S1-F12-T02 — Revoke, retire, replace and the devices readiness check

Status: blocked
Blocked by: S1-F12-T01; S1-F04-T02 (the readiness checks this ticket adds the devices check to)
Feature: [S1-F12 Billing devices and device bill series](../../spec.md)

## Build

The end of a device's life, its series following its units and their mappings, and the devices check that selling readiness needs ([offline-counter.md](../../../../design/pos/offline-counter.md) (GC-8) 3.5, 4.3, 4.4, section 11 and 12.1).

- **Revoke a lost device** (3.5; `PRD-SEC-008`, `DEC-092`): `pos` calls the `access` operation Register or revoke a device, which makes it Revoked and ends its sessions at their next request; in the same transaction `pos` closes its series, since every stage 1 device is an online till and holds no local numbers. `access.device-revoked` is published for other consumers. Revoked is final.
- **Retire** (3.5): an online till's series close and its sessions end at once; the device is Ended, which is final. Event `pos.device-ended`.
- **Replace** (3.5; `PRD-OFF-010`, `PRD-LIF-015`): the old device is retired or revoked as above; the replacement is a new device with a new code, enrolled with a new key, and gets fresh series. A closed series is never continued or reopened (numbering-and-audit 3.1).
- **Change a device's units** (12.1): a dated change, refused unless the device is Active; a unit that brings a new registration gets the device's series for it.
- **Mapping changes** (4.3): on `organisation.mapping-changed`, when a unit's mapping moves to another registration from a future date, `pos` defines the device's series for that registration before the date; the consumer is idempotent on the event (`PRD-INT-008`).
- **The devices readiness check** (section 11; RR-016; `PRD-LIF-001`, `PRD-LIF-002`): registered with the readiness checks of `S1-F04`, replacing the "not available yet" answer. Selling passes only when at least one Active billing device of the unit's Store lists the unit and has an Open series for the registration of the unit's mapping in force on the check date, in that date's financial year; Revoked and Ended devices do not count; receiving and movement are not applicable. A failure names what is missing: no device, or a device with no series and why (no confirmed format, no financial-year dates, a mapping with no registration) (`PRD-UXP-003`). It asks for no offline counter and no number of devices beyond one.
- **Screens**: revoke, retire, replace and change units on Setup › Devices, tills and bill series, each with its refusals; the devices check's result on the readiness screen of `S1-F04`.

## Expected outputs

- Revoke, retire, replace and unit changes in `pos` and `access`; the mapping-change consumer
- The devices readiness check; the screen actions; tests and the completed Admin journey

## Done when

- GC-8 14.1 tests 3, 5, 6, 7, 8, 9, 10 and 12 pass
- numbering-and-audit 7 test 4 passes for device series: a closed series refuses allocation and cannot reopen, and a replaced device starts fresh series (the switched-Store part is `S1-F08`'s, with the switch itself in stage 4)
- access-and-approvals 15 test 5 passes for devices: revoking a device refuses its sessions' next request (the sessions part is S1-F01-T09's)

## Notes

- Test 8 follows the product owner's answer of 6 Oct 2026 (DEC-116): enrolment without a format or financial-year dates succeeds and defines no series, and this check fails naming what is missing.
- Revoking or retiring an offline counter (pause, queue reconciliation, release) and releasing a lost counter's protected quantity (GC8-1) are stage 4 (`S4-F11`).
- Live gates as in S1-F12-T01: RR-060, RR-101 (V-40).
