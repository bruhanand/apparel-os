# S1-F04-T01 — Policy readiness and the Available check

Status: blocked
Blocked by: S1-F01-T13, S1-F01-T16, S1-F06-T05 (stored files, for signature and validation evidence)
Feature: [S1-F04 Policy readiness and Site activation](../../spec.md)

## Build

The policy gate in `configuration` ([module-map.md](../../../../design/architecture/module-map.md) 4.4, 6.1; [domain-model.md](../../../../design/architecture/domain-model.md) 3.6, invariant 6; [access-and-approvals.md](../../../../design/access/access-and-approvals.md) 7.1 step 2; [code-house-rules.md](../../../../design/platform/code-house-rules.md) 12.3, 12.14). No design lists numbered readiness tests; the checks below come from the [stage spec](../../spec.md), Testing Decisions.

- **Policy status** (PRD "Required policy configuration"; `DEC-092`): one record for each of the 19 policies, Open until Signed. Recording Signed keeps the policy's "Signed by, date" line of [kdps-policies.md](../../../../kdps-policies.md): the signatory, the date and the evidence, a stored file attached through S1-F06-T05. Emits `configuration.policy-status-changed`.
- **Validation of real values** (DM-6, `DEC-105`): recorded with its evidence, a stored file attached through S1-F06-T05, by a person holding the validate permission who did not enter the values. No rule requires the person who records Signed to differ from the validator (product owner, 6 Oct 2026, DEC-116).
- **Capability controls** (`PRD-SEC-017`): each feature declared in code, off for every Organisation until an Admin switches it on; switching it on never bypasses a missing policy or an invariant. Emits `configuration.capability-changed`.
- **Validity checks** (module-map section 3, rule 6): each module registers a check of its own configured records; each policy-dependent operation declares its governing policy, its capability, and whether an activity grant applies. Modules already built register theirs, the `exceptions` routing and exception-code series answers of S1-F08-T02 among them (`POL-02.16`).
- **Which operations are gated** (`PRD-SEC-017`, as the product owner read it on 6 Oct 2026, DEC-116): setup and configuration operations (access, structure, masters, book setup, readiness, policy readiness) are not policy-gated, because they are how a policy gets configured, but they still need their permissions and independent approvals. Operations that record business effects are gated: stock or money posting, opening-data publishing and device selling.
- **Check availability** (module-map 4.4): available only when the capability is on, the policy is Signed, the owning module's configured records are valid, the real values are validated, and, for receiving, movement and selling, the Site or business unit holds the activity grant. Otherwise unavailable, naming the policy by number and name and what is missing: signature, validation, configuration, capability or activity (`PRD-UXP-003`). The activity grant record is created here, empty; S1-F04-T02 writes it. A labelled synthetic Signed status or setting may be recorded only on a synthetic Organisation, for tests and demos: it is refused outside local work, tests and `dev`, so never on `kdps-test` or production (product owner, 6 Oct 2026, DEC-116; house rules 12.14). Every command and job step asks it at step 2 of module-map 6.1, and a refusal carries `missing` and `next` in the error envelope (house rules 12.3).
- **Read model and screens**: Setup › Policy readiness (ui-blueprint: the 19 policies, Signed, configured, what is blocked), with the Signed state ([design-language.md](../../../../design/ui/design-language.md) section 7); the "Live action unavailable" banner on a gated action, which stays visible but disabled with the same reason and links to Policy readiness (design-language 10.17).

## Expected outputs

Policy status, validation, capability controls, validity-check registration, activity-grant record and Check availability in `configuration`, with their migration and `tables.json` entries; schemas and routes; the Policy readiness screen and the unavailable banner; tests

## Done when

- access-and-approvals 15 test 1 passes: stage 1 exit check 5 ([README](../../README.md) 7.1), with the browser journey below as its on-screen evidence
- A capability is off until switched on; switched on while its policy is not Signed, the operation stays unavailable and names the policy
- A Signed policy whose values are not validated is unavailable and names the missing validation; validation by the person who entered the values is refused; validation with an attached evidence file by a person holding the validate permission who did not enter the values is accepted, even when that person recorded Signed, and the operation becomes available
- A setup or configuration operation, such as an access change, is never refused by the policy gate but still needs its permission and independent approval; a synthetic business-effect operation stays unavailable until its policy is Signed and validated
- With the environment set to `kdps-test`, or to any value other than local, tests or `dev`, recording a synthetic Signed status is refused
- An operation that needs an activity grant is unavailable without it, naming the activity and the place
- Status and capabilities of one synthetic Organisation change nothing in the other
- Browser journey: a gated synthetic action shows the banner naming its policy and what is missing, and links to Policy readiness, where the policy shows Open; after a synthetic Signed record with a synthetic evidence file, and a validation by a person who did not enter the values, the action is enabled

## Notes

- Who validates (DM-6): the person who entered a policy's values cannot validate them, and no rule requires the person who records Signed to differ from the validator. This replaces the earlier wording "Signed and validated by different people" (product owner, 6 Oct 2026, DEC-116).
- Which operations are gated is as Build says (product owner, 6 Oct 2026, DEC-116): no stage 1 setup operation built before this ticket becomes unavailable, and the `dev` demos use labelled synthetic statuses on synthetic Organisations (design-language 10.17; house rules 12.14).
- How `configuration` learns who entered a policy's values (DM-6) is not designed; write it into module-map 4.4 with the code.
- Signature and validation evidence is a real stored file from the start: S1-F06-T05 is built right after S1-F01, and this ticket attaches it (product owner, 6 Oct 2026, DEC-116).
- Live use: every policy is Open (RR-157 to RR-175); RR-177 confirms the DM-6 pick. RR-212 is answered (product owner, 6 Oct 2026, DEC-116): the first Admin lands on Setup › Users (S1-F01-T14).
