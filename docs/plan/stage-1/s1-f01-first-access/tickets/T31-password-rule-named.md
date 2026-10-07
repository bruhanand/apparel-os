# S1-F01-T31 — A refused password names the rule it failed

Status: ready-for-agent
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- The password check returns which rule failed (today the least number of characters), not only yes or no
- The refusal `access.password-refused` carries the rule's value (a setting value, never the password) on every path that sets a password: own password, credential reset, new user, operator recovery
- The screen says the rule, such as "needs at least 12 characters", and what to do next (design-language 13)

## Done when

- Unit tests of the check and the message
- An integration test of the first-sign-in password step shows the rule in the refusal and no secret anywhere
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F1.
