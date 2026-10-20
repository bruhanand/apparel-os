# S1-F12-T04 — A till's scheduled later units on screen

Status: done
Blocked by: S1-F12-T02 (done; a device's units change from a date)
Feature: [S1-F12 Billing devices and device bill series](../../spec.md)

## Build

Setup › Devices, tills and bill series shows, under a till's units, its scheduled later units with their start date ([offline-counter.md](../../../../design/pos/offline-counter.md) (GC-8) 3.7, the "Change units" bullet; 12.1). Product owner, 20 Oct 2026 (RR-495): a small stage 1 fix.

- **The read**: each device in the devices list also answers its scheduled unit changes: every later date from which its list of units differs, with the whole list in force from that date, earliest first. Nothing changes in how units are stored or changed.
- **The screen**: under the units listed today, each scheduled change as its start date and its units, in the Organisation's date format; nothing when none is scheduled.

## Expected outputs

- The devices list's answer with the scheduled units, its schema and the OpenAPI document
- Tests on the server and on the screen

## Done when

- A change of units from a later date shows on the devices screen, under today's units, with its date and its whole list of units; today's units are unchanged until that date
- A device with no later change shows none
- The design's "Change units" bullet says what is built; RR-495 is closed

## Notes

- **Built** (20 Oct 2026; offline-counter 3.7 "As built"): `scheduledUnits` on `billingDeviceViewSchema`; `Pos.billingDevices` reads every unit row in force on the date or later and lists each later date a row starts or ends on with the whole list then; the screen shows "From <date>, units: <codes>". Tests: `billing-devices-lifecycle.int.test.ts` and the journey `billing-devices.spec.ts`; the counter's enrolment test answers the new field.
- **Review fix** (20 Oct 2026): a Revoked or Ended device shows no scheduled units, since revoking or retiring does not end its unit rows. A display choice, not a business rule; tell the builders if it should show them.
- No screen unit test: the screen is covered by the browser journey.
