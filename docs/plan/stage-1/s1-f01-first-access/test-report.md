# S1-F01 — Hands-on test report

> **Not ranked.** A record of the hands-on test of `S1-F01` before the product owner's acceptance (`S1-F01-T20`, RR-350). It decides nothing.

Run on 7 Oct 2026 by hand through the real screens, on a local copy of the `main` code (the browser journeys' server: the real setup step, synthetic data, the test sign-in on as `local`). Synthetic Organisation `SYN-ORG-JOURNEY` was set up by the setup step; `SYN-ORG-A` and `SYN-ORG-B` came from the fixtures. Every value was SYNTHETIC. A short repeat on Railway `dev`, with the product owner typing the authenticator codes, follows (section 3).

## 1. Results

| # | Area | Case | Result | What was seen |
| --- | --- | --- | --- | --- |
| 1 | Sign-in | Company code, login, password and code | Pass | Landed on Setup › Users (the Admin's persona landing) |
| 2 | Sign-in | Wrong password, wrong code, unknown company, unknown login | Pass | One message for all: "The Organisation code, login, password or authenticator code is not right." Code and login stay filled, password cleared |
| 3 | Sign-in | Repeated failures | Pass | 6th failure in 10 minutes answered "slowed", also for a login that does not exist |
| 4 | Sign-in | Correct password without the code, after enrolment | Pass | Refused with the same message |
| 5 | First sign-in | Temporary password, enrolment, own password | Pass | Steps in order; a reload returned to the same step; QR code and setup key shown once |
| 6 | First sign-in | Weak new password | Pass, finding F1 | Refused, but the message does not say which rule failed |
| 7 | Test sign-in | Button below Sign in | Pass | One press signed in; Sign-ins history shows "Test sign-in". Also checked live on `dev` |
| 8 | Reasons | Admin proposes 2 approve and 2 reject reasons | Pass | Each "Awaiting approval"; all in the approver's My work |
| 9 | Reasons | Deciding before a reason list is in force | Pass | Unavailable, naming the missing approve and reject lists |
| 10 | Reasons | First list decided in own words | Pass | Approved; panel shows approver, time and the free-text reason |
| 11 | Roles | Role from the permission grid | Pass, finding F3 | Sent for approval |
| 12 | Users | New person with persona and temporary password | Pass | "Not in force yet · Awaiting approval" |
| 13 | Assignments | Assignment, all-members scope | Pass | Empty-scope warning shown when a dimension is empty; sent for approval |
| 14 | Assignments | Start in the past | Pass, finding F8 | The date field will not take a past date; the server refuses one sent directly (`access.starts-in-past`) |
| 15 | Approval | Assignment before its person | Pass | "The user this role assignment is for is not approved yet. Decide the user first." |
| 16 | Approval | Person, role and assignment approved with a list reason and a fresh code | Pass | Each Approved; the reason picker offered only approve reasons in force |
| 17 | Independence | Admin tries to approve | Pass | Panel: not available, "Needs Approve on Role". Self-preparation by a person who may approve is proved by the automatic tests (AT10) |
| 18 | Fresh code | Same code twice | Pass | "The authenticator code is not right, or was already used." |
| 19 | Supersede | Change a submitted role | Pass | Old version "Superseded"; only the new request in My work |
| 20 | Reject | Reject a reason change | Pass | Rejected, with the reason recorded |
| 21 | New access | New person signs in | Pass | Enrolled, set a password, landed on Audit log; menu shows only granted screens |
| 22 | Least access | Screen the role does not grant | Pass | "Not available to you. Needs View on Security setting. Ask an Admin…"; buttons for actions not granted are greyed with the reason |
| 23 | No access | Person with no assignment | Pass | "No access assigned" with Sign out on every address; every data request refused `access.not-authorised` |
| 24 | History | Assignment history read by the new person | Pass | Preparer, approver, reason, version, in plain words |
| 25 | History | Audit log tabs | Pass | Sign-ins lists every attempt, refused ones too; an unknown login shows "No user matched", never what was typed; tabs not granted are hidden |
| 26 | Sessions | Idle past the limit with a half-filled form | Pass, finding F2 | Lock screen; unlock with the password; login and name kept, temporary password cleared |
| 27 | Sessions | Sign out; revoke sessions | Pass (sign-out); revoke by automatic tests | A locked session reaches only unlock and sign-out, as designed |
| 28 | Disable | Approve disabling a person created the same day | Pass | Refused at sign-in at once, even with the right password and code (`DEC-118`) |
| 29 | Settings | Admin proposes a session-limit change; approver approves | Pass | New idle limit in force at the moment of approval |
| 30 | Settings | Admin approves own setting change | Pass | Not eligible, as case 17 |
| 31 | Isolation | Another company's data | Pass | Each company's screens list only its own people; cross-company requests are proved by the automatic tests (AT02) |
| 32 | Screens | Light, dark, phone width, keyboard | Pass, finding F5 | Both themes readable; no sideways page scroll at phone width; Tab reaches "Skip to content" first |

**32 of 32 cases pass**, three of them partly through the automatic tests. No case found wrong behaviour against the spec.

## 2. Findings

| # | Finding | Severity | Suggested owner |
| --- | --- | --- | --- |
| F1 | A refused new password does not say which rule failed (for example the least number of characters) | Low, usability | Builders, with the next sign-in screen change |
| F2 | The idle lock shows only at the next click, not while the screen sits idle (as designed, RR-301: screens do not poll); a person may think the screen is still open | Low, design question | Product owner |
| F3 | The role editor lists the background system's record types (Effective grant, Audit seal, Audit partition, Outbox event, Work item) to people; ticking them could give a person the worker's powers | Medium | Product owner decides whether people may hold them; builders hide them if not |
| F4 | Sign out from the profile menu sometimes needed a second press | Low, to confirm by hand (may be the test tool) | Builders |
| F5 | At phone width the top bar is crowded; the person's name wraps to three lines | Low | Builders |
| F6 | The operator recovery command loses answers piped to it all at once (found on `dev`) | Medium, operator tool | Builders |
| F7 | On the long role form the Request approval button is far below the permission grid | Low | Builders |
| F8 | A past date typed into a date field is ignored without a message | Low | Builders |

## 3. On Railway `dev`

Checked so far: the test sign-in buttons appear below Sign in and sign in (case 7); the approver's My work lists the requests prepared by the Admin with what each is for (cases 8, 16); the approval panel opens with the version, details and "You didn't prepare this, so you can decide it" (case 10). Decisions on `dev` need the product owner's authenticator codes.
