# S1-F01-T35 — Operator commands keep answers piped in at once

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- The operator prompt shared by `recover-first-user` and `setup-organisation` keeps every answer when all arrive in one chunk, still never echoing or logging a secret

## Done when

- A unit test feeds every answer in one chunk and gets them all, in order
- Every check and both test suites pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F6.
- Found on Railway `dev` during the recovery of the SYN-ORG-A first users.
- Built: `ask` and `askWithSecrets` in `apps/server/src/operator-prompt.ts` read every line from one iterator over the input, created before any line is read, so lines that arrive in one chunk are kept for the questions that follow. The streams are a parameter (the terminal by default), so `operator-prompt.test.ts` feeds synthetic input in one chunk and line by line. A question the input ended before is answered with an empty line, which the commands already refuse for a password. Secrets are still not echoed or logged.
