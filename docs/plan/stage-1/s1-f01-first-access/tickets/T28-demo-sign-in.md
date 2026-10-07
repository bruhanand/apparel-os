# S1-F01-T28 — Test sign-in buttons on the development environments

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- One button per SYNTHETIC person listed in `AOS_DEMO_SIGN_IN`, below the Sign in form, signing in without the password or the authenticator code (access-and-approvals 3.4; deployment.md section 3; `POL-02.17`, `PRD-ACS-017`; `DEC-121`)
- On only where `AOS_ENVIRONMENT` is `local` or `dev`; the server refuses to start with the list set anywhere else or naming an Organisation whose code does not begin `SYN-`
- The person must be listed, Active and with a current password; an unfinished first sign-in still leads to enrolment; each attempt writes a `demo-sign-in` access record

## Expected outputs

The settings reader, the two routes, the command path, migration `0023__audit__demo_sign_in_kind.sql`, the buttons, tests and design edits

## Done when

- Unit tests of the settings reader pass (off when unset; refused outside `local`/`dev`, for a non-SYNTHETIC code, for bad JSON)
- `apps/server/test/demo-sign-in.int.test.ts` passes: a listed Active person is signed in with a `demo-sign-in` record; a disabled, unlisted or other-Organisation person is refused; off refuses everything
- `apps/web/e2e/demo-sign-in.spec.ts` passes: the button shows below Sign in and one press signs in
- Every check, both test suites and the browser journeys pass

## Notes

- Requested by the product owner on 7 Oct 2026 for the Railway `dev` demo (`DEC-121`). On `dev` the `app` service gets `AOS_DEMO_SIGN_IN` with the SYNTHETIC first users of SYN-ORG-A and SYN-ORG-B; unset it to remove the buttons.
