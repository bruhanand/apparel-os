# Decision walkthrough log — 3 Oct 2026

> Records choices for [decision-pack.md](decision-pack.md). Each row maps to a `DEC-0xx` entry in [decisions.md](../decisions.md) when the pack requires logging. **OPEN** values are not set here.
>
> **Approval:** On 3 Oct 2026 the product owner approved every pack **My pick**. Choices below follow them, with deduplication for C-10/N-40 (PRD-UXP-004 capabilities; this dedupe overrides C-10's own pick B) and N-47 → A (no confirmed KDPS source for the cash-approver split). Amend any row and add a corrective DEC if you override.

| ID | Choice | Notes | DEC |
| --- | --- | --- | --- |
| N-03 | A | Transfer qty reduction not material | DEC-036 |
| N-04 | A | Exception routing via POL-02.16 | DEC-037 |
| N-47 | A | No KDPS source confirmed for SM/Accounts split | DEC-038 |
| N-55 | A | No-bill return limit uses documented valuation | DEC-039 |
| N-57 | A | New POL-02.22 for phone/WhatsApp approvals | DEC-040 |
| N-09 | A | Self-service via role assignment | DEC-041 |
| N-79 | A | Partner users + service identities in PRD | DEC-042 |
| N-80 | A | Camera scan OPEN; phone = responsive web note | — |
| C-07 | A | Higher authority = limit ladder + different person | DEC-043 |
| N-01 | B | Stage 1 rules; later stages record from first live op | DEC-044 |
| N-10 | A | Needed-by = earliest value stage | DEC-045 |
| N-12 | A | Statutory row split by part/stage | DEC-046 |
| N-23 | A | Old-POS import not incentive evidence | DEC-047 |
| N-42 | A | Business measures during side-by-side test, no duration | DEC-048 |
| N-43 | A | Go/no-go checks into policy 14 | DEC-049 |
| N-44 | A | Mark two targets (proposed) | DEC-050 |
| N-63 | A | Offline via policy 16 + exit check only | DEC-051 |
| N-65 | A | Real-data test needs D-4; no signed policies required | DEC-052 |
| N-71 | A | PT export used during test | DEC-053 |
| C-12 | A | Profile → piece via labelling count | DEC-054 |
| C-13 | A | Putaway stage 2; general location moves stage 3 | DEC-055 |
| C-10 / N-40 | N-40 B (equals C-10 A) | PRD-UXP-004 lists capabilities/areas; C-10's own pick B (rename design menus) conflicts and was not applied. Owner to confirm | DEC-056 |
| X-05 | A | PRD-TAX-004 in stage 4 | DEC-057 |
| X-08 | A | Hindi step per stage including stage 6 | DEC-058 |
| N-20 | B | Interim unavailable for unlinked returns | DEC-059 |
| N-21 | B | deployment.md proposal + D-6 OPEN | — |
| N-24 | A | PRD-LED-011 follows Official book policy | DEC-060 |
| N-27 | A | Stock-count accuracy without tolerance-as-match | DEC-061 |
| N-37 | A | F7 manager approval online-only offline | DEC-062 |
| N-53 | A | POL-10.10 gift-voucher tax home | DEC-063 |
| N-54 | A | POL-16.07 working-set validity | DEC-064 |
| N-56 | A | POL-06.08 pointer to policy 7 | DEC-065 |
| N-70 | A | kdps-test full TOTP; D-6 dev login OPEN | — |
| N-85 | B | Unit moves via location/transfer rules; custody + cost recheck | DEC-066 |
| N-88 | A | Side-by-side test vocabulary; nested POS question OPEN | DEC-067 |
| N-89 | A | Billed-retained in Words used | DEC-068 |
| N-91 | B | No value-only carve-out during count freeze | DEC-069 |
| N-94 | A | receipt origin, Crore, billing device, capitalisation | DEC-070 |
| N-51 | B | WCAG design target only | — |
| N-52 | A | Remove Seen/Acknowledged from design | — |
| N-81 | A | Gated actions disabled on kdps-test until signed | DEC-071 |
| N-82 | A | INR formats; non-INR OPEN | — |
| N-83 | A | Reason list in policy 2 | DEC-072 |
| N-28 | A | PRD-NAV-016 fix | DEC-073 |
| N-30 | A | Daily summary channel fixed WhatsApp | DEC-074 |
| N-41 | A | POL-18.03 proposed cadence | DEC-075 |
| N-58 | A | Contra in PRD-LED-012 | DEC-076 |
| N-62 | A | PRD-OFF-002 aligns with DEC-005 | DEC-077 |
| N-92 | A | Policy 2 wording + count movement bullet | DEC-078 |
| N-99 | A | Policy 6 question reword | DEC-079 |
| N-100 | A | PRD IDs banner reword | DEC-080 |
| N-101 | A | Correct DEC-018 changed list | DEC-081 |
| X-01 | A | Online-only list extended | DEC-082 |
| X-02 | A | Policy homes for five PRD rules | DEC-083 |
| X-06 | A | Label printing via local helper | DEC-084 |
| X-10 | B | V-65 for representative name | DEC-085 |
| N-64 | A | Inbound ownership stage 2 | DEC-086 |
| N-33 | A | Journals in same txn as movement | DEC-087 |
| N-48 | A | No EBO piece-tracking exception | DEC-088 |
| N-106 | A | PRD rules for EBO oversell + damage undo | DEC-089 |
| N-45 | B | Billed-retained carve-out via DEC | DEC-090 |
| N-49 | A | Consignment return per agreement | DEC-091 |
| N-86-owner | B | Owners stay OPEN | — |
| N-87-stage | OPEN | Helper/Tally stage unset | — |
| N-05/N-26 | B | Approvers OPEN in policy 2 | — |
| Owner grid | A | Keep proposed Owner grid | — |
| C-11 | A | Signed / Revoked states | DEC-092 |
| N-84-transfer | A | In transit vs Dispatched split | — |
| C-09 | A | Wait for CA on bill format | — |
