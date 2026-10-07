# S1-F01-T34 — A start date before today says so

Status: ready-for-agent
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- A start date before the Organisation's today shows the start-date message below the field, on blur and on submit, instead of being ignored (design-language 8, form fields)
- One shared check used by every start-date field (assignments, roles, reasons, security settings); the server still checks every date

## Done when

- A unit test of the check and a component test of the message
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F8.
