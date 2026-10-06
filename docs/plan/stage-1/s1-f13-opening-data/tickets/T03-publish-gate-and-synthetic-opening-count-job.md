# S1-F13-T03 — Publish gate and synthetic opening count job

Status: blocked
Blocked by: S1-F13-T01; S1-F04-T01 (the policy gate: policy 14 Signed and validated); S1-F10-T07 (failure suites, each approval used once, and the large-posting job)
Feature: [S1-F13 Opening-data layouts and reconciliation](../../spec.md)

## Build

Publishing an opening batch stays unavailable without policy 14; on synthetic data in tests, a test handler posts a whole opening through the stock ledger as one queued job ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 4.2, 10.1, 10.5, 10.6, section 12; stock-ledger section 9 and 10.6).

- **The publish gate** (4.2, 10.1; `PRD-SEC-017`, `PRD-UXP-003`): Publish of an opening-balance batch asks Available: policy 14 Signed and its real values validated, on production hosting, at the Store's approved switch (`POL-14.07`, `PRD-LIF-026`). Otherwise it is unavailable and names what is missing. On `kdps-test` it is always unavailable (`DEC-071`; GC6-8). A batch for a unit whose cutover is complete is refused (`PRD-LIF-011`).
- **The test handler, posting half** (section 12, 10.6): composed only into the test application (code-house-rules 11.4; harness decisions H2 and H5), registered with the stock ledger for the opening-balance kind, keeping a synthetic switch record and its cutover in its `test_` schema. The approval click records the decision and a request to post naming the batch version; one queued job per book then locks, rechecks, writes the opening count movements with their opening receipt origins and records the decision's use, in one transaction (access-and-approvals 9.8; `DEC-097`, `PRD-INT-004`). A failed job posts nothing and leaves the decision unused. Tests mark policy 14 as synthetically Signed and validated (code-house-rules 11.1).
- **What opening data never does** (10.5; stock-ledger section 9): a counted row with no valuation evidence is held as excess, with owner, coverage and cost Unknown (`PRD-STK-014`); an empty unit declares zero by a declaration, not a file (`PRD-LIF-003`); no supplier delivery, booking, invoice, purchase liability or automatic journal is created (`PRD-LIF-008`); an explicit Unknown season is audited and matches no season-specific offer (`PRD-ACP-014`).
- **Measured** (10.6; `PRD-PRF-003`): a synthetic 30,000-row opening posts while synthetic counter finalisations run, by the method of S1-F10-T07; an early signal only, the binding measurement being the counter in stage 4 (RR-189).
- **Screen**: Publish on an opening batch shows unavailable with what is missing, in a browser journey (stage 1 exit check 5).

## Expected outputs

- The publish gate in `files-imports`; the posting half of the opening-balance test handler
- Tests, the measurement and the browser journey

## Done when

- GC-6 17 tests 20, 22 and 24 pass
- The browser journey shows the unavailable reason on screen; with test 22 it is this feature's part of stage 1 exit check 5
- The measurement is recorded

## Notes

- RR-013 answered (GC6-18; product owner, 6 Oct 2026, DEC-116): the synthetic opening-count handler runs in tests only; it is never composed into the application deployed to `dev`.
- RR-170: policy 14 is signed only for live use at a switch (stage 4). Nothing here loads real opening data (`DEC-013`).
- RR-132 (GC6-9): until Accounts and the CA say what counts as valuation evidence, no value in a KDPS file is taken as evidence.
