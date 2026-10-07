# S1-F01-T34 — A start date before today says so

Status: done
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
- Built: `apps/web/src/forms/start-date.ts` (`startsInPast`, `withStartDateChecks`) wired through `useRouteForm`'s third argument, and into the assignment form's own resolver. A start before the Organisation's today fails with `access.starts-in-past`, whose existing message shows below the field on blur and on submit. `min` stays and the server still checks. Security settings use the day after today as the earliest, as the server refuses a start today there too; its message still reads "today or a later date", which is a wording gap for the product owner. The end date ("Ends before") is not a start date and is unchanged.
