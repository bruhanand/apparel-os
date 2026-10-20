# S1-F12-T05 — The shared POS session limits on Security settings

Status: in-progress
Blocked by: S1-F01-T25 (done; changing essential security settings); S1-F12-T01 (done; the setting `access.shared-pos-session-limits`)
Feature: [S1-F12 Billing devices and device bill series](../../spec.md)

## Build

Setup › Security settings offers a shared POS session limits card (`access.shared-pos-session-limits`), prepared and approved like the office session limits ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) (GC-3) 3.3, the "Changing an essential security setting after setup" bullet; [design-language.md](../../../../design/ui/design-language.md) 10.19; `POL-02.06`, `POL-02.07`, `POL-02.18`). Product owner, 20 Oct 2026 (RR-494): offered now in stage 1.

- **The setting among the essential security settings**: listed by the security settings read, with its versions and the one in force; a new version prepared by a person with edit on `access.setting` and approved by a different authorised person with approve on it, with a fresh authenticator code, effective from its decision or a later business day, as the other three.
- **The card**: the idle-lock and absolute seconds, its origin and when it takes effect, as the office session limits' card shows them.
- **No value is chosen**: the limits are policy 2's (V-04), OPEN. The form starts from the version in force, or empty; tests use labelled synthetic values.

## Expected outputs

- The setting in the security settings schemas, read and form; the OpenAPI document
- Tests on the server (prepare and approve, the preparer cannot approve) and on the screen

## Done when

- A shared POS session limits version prepared by one person takes effect only when a different authorised person approves it, and a device's shared POS session reads it
- The card shows "not set" while the setting is not set, and the version in force once approved
- No value is chosen; the design's bullet says what is built; RR-494 is closed
