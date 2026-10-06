# S1-F14-T01 — Finish the backup and restore design

Status: ready-for-agent
Blocked by: —
Feature: [S1-F14 Backup, restore and export proof](../../spec.md)

## Build

Documents only; no code. Bring [backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) to a state the product owner can approve, so the code of S1-F14-T02 and S1-F14-T03 meets no open design question.

- **Write in the approvals of 6 Oct 2026** (product owner): GC9-9, import batch codes from a `numbering` series (replacing the "until it is decided" text of 5.3), and GC9-10, object keys that start with the Organisation's identifier (2.1).
- **Deleting stored files after retention** (`POL-18.05`): 3.3 and 8.2 say the application never deletes an object, while retention is set by record class. Design how a stored file and its object are deleted once their class's period ends: only through a named retention function of `files-imports`, checking legal holds first (8.3), recorded with an audit record, what becomes of attachments that point to it, and how it meets backups (8.4). Nothing is deleted while no period is set (8.2; numbering-and-audit 4.6).
- **Key recovery** (2.3; `POL-18.02`): what happens when the environment's copy of an Organisation's data key or of the backup key is lost or damaged; how a key version is recovered from its kept copy, by whom, and with what record; what the drill checks (section 6); and what is lost if every copy is lost.
- **GC9-7 and GC9-8**: set out the options (the migration role or a separate read-only backup role; the recovery commands in `configuration` with a listed call to `numbering`), have the product owner decide them, and write the answers into GC-9 and its section 13 edits.
- **Rewrite GC9-12 to name no custodian**: copies of every key version are kept outside Railway, apart from every backup, by a named custodian. On `dev` the product owner names that custodian before the drill (S1-F14-T04); on production custody belongs to the KDPS Owner and Admin under policy 18 and blocks live use only.
- **Ask KDPS**: add the production backup-key custodian question for the KDPS Owner and Admin (policy 18; needed before live use in stage 1) to [questions-for-kdps.md](../../../../questions-for-kdps.md), in plain language, and track it in [kdps-values.md](../../../kdps-values.md) under the next free RR number.
- **On approval**: GC-9's status becomes Current; make the edits of its section 13 in the other documents, leaving those S1-F06-T05 and S1-F06-T01 already made; close RR-010 in [open-items.md](../../../open-items.md) and update [STATUS.md](../../../../STATUS.md).

## Expected outputs

- GC-9 complete: approvals written in, file deletion after retention, key recovery, GC9-7, GC9-8 and GC9-12 settled
- The KDPS question and its tracked value
- After approval, the section 13 edits in the other designs

## Done when

- No choice that S1-F14-T02 or S1-F14-T03 needs is left Proposed or OPEN in GC-9, except the values that are KDPS's under policy 18 and the Railway assumptions of 14.3
- `pnpm check:links` passes
- The product owner approves GC-9 (RR-010)

## Notes

- A change to the PRD or the policies is logged in [decisions.md](../../../../decisions.md) first; none is expected here.
- The Railway assumptions GC9-A4 to GC9-A6 are verified before the drill, in S1-F14-T04, not here.
- Retention periods, legal holds and recovery targets stay KDPS's (RR-075, RR-076, RR-123); this ticket sets none.
