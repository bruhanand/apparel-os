# Issue tracker: local Markdown in docs/plan

Specs and tickets for this repo live as Markdown files under `docs/plan/`. There is no GitHub issue tracking.

## Conventions

- One folder per stage, `docs/plan/stage-N/`, with a `README.md` holding the stage's goal, status, features and exit checklist.
- One folder per feature inside it, named by its label and title: `docs/plan/stage-1/s1-f01-first-access/`.
- The spec is `<feature>/spec.md`.
- Tickets are one file each in `<feature>/tickets/`, named `T<NN>-<slug>.md` with the task number of the feature's label (`T04-idempotency-helper.md` is `S1-F01-T04`), numbered from `T01`. Never one combined tickets file.
- Each ticket starts with the heading `# <label> — <title>`, then the lines `Status:`, `Blocked by:` and `Feature:`, then the sections Build, Expected outputs and Done when, and Notes when there is something to note (it is optional; closing a ticket adds it, with the commit). `Status:` takes a value from [triage-labels.md](triage-labels.md). A ticket whose `Blocked by:` is not cleared is `blocked`, even if part of it is already done; say what is done in Notes.
- Comments and conversation history are appended under a `## Comments` heading at the bottom of the ticket.
- Questions for the product owner go to [open-items.md](../plan/open-items.md); KDPS values go to [questions-for-kdps.md](../questions-for-kdps.md) and [kdps-values.md](../plan/kdps-values.md). They are not tickets.
- A spec or ticket cites `PRD-`, `POL-` and `DEC-` IDs and design sections; it never settles a business decision or invents a KDPS value (`AGENTS.md`).

## When a skill says "publish to the issue tracker"

Create the feature folder under the current stage (or the stage the feature belongs to) and write `spec.md` or the ticket files there. Add the feature's tickets to its `spec.md` ticket table and its row in the stage `README.md`.

## When a skill says "fetch the relevant ticket"

Read the ticket file. A label such as `S1-F01-T04` maps to `docs/plan/stage-1/s1-f01-…/tickets/T04-*.md`. Commit subjects start with the label, so `git log --grep S1-F01-T04` finds its commits.

## Closing a ticket

Set `Status: done` only after the steps of `AGENTS.md` "How we work", with no blocking finding left; add the commit under Notes (creating the section if the ticket has none); update the stage `README.md` status and `docs/STATUS.md`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per decision ticket.

- **Map**: `docs/plan/<effort>/map.md` (Notes / Decisions-so-far / Fog). For a stage's design questions, `<effort>` may be the stage folder.
- **Child ticket**: `docs/plan/<effort>/tickets/T<NN>-<slug>.md`, numbered from `T01`, with the question in the body. A `Type:` line records the type (`research`, `prototype`, `grilling`, `task`); `Status:` records `claimed` or `done`.
- **Blocking**: the `Blocked by:` line lists ticket numbers. A ticket is unblocked when every ticket it lists is `done`.
- **Frontier**: scan the tickets folder for files that are open, unblocked and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under `## Answer`, set `Status: done`, then add a pointer (gist and link) to the map's Decisions-so-far. A decision that changes the PRD or the policies is a `DEC-nnn` entry first, approved by the product owner.
