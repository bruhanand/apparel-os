# Triage labels

The skills speak of five canonical triage roles. This repo has no labels: a ticket carries its role as the value of its `Status:` line (see [issue-tracker.md](issue-tracker.md)).

| Role in mattpocock/skills | `Status:` value here | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | The product owner or a builder still has to evaluate it |
| `needs-info` | `needs-info` | Waiting for an answer: from the product owner ([open-items.md](../plan/open-items.md)) or KDPS ([questions-for-kdps.md](../questions-for-kdps.md)) |
| `ready-for-agent` | `ready-for-agent` | Fully specified and unblocked; an agent can build it |
| `ready-for-human` | `ready-for-human` | Needs a person: an approval, a Railway step, a KDPS conversation |
| `wontfix` | `wontfix` | Will not be done; the reason is in the ticket |

The repo also uses four more values: `blocked` (its `Blocked by:` tickets or gates are not cleared), `in-progress` (someone is building it), `done` (built, reviewed with no blocking finding left, checks passing) and `merged` (its work and tests moved into the ticket its Notes name; the file stays so its label still resolves).
