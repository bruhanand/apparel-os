# S1-F01-T35 — Operator commands keep answers piped in at once

Status: ready-for-agent
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
