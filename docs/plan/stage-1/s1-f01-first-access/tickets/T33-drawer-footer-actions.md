# S1-F01-T33 — Form actions in the drawer footer

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- Every form in a right drawer puts its actions (Request approval and Cancel) in the drawer's fixed footer, outside the scrolling body (design-language 10.15): roles, assignments, and any other drawer form that does not yet

## Done when

- A component test shows the role form's Request approval in the footer
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F7.
- The design already decided this; the code did not follow it.
- Built: `FormActions` in `apps/web/src/setup/RecordDrawer.tsx` draws Cancel and the primary button into the drawer's footer (a portal into the footer the drawer mounts) and submits by `form="<id>"`, so each form keeps its own state; all nine drawer forms of Setup (users, roles, assignments incl. withdrawal, reasons, security settings) use it. The footer is hidden while empty. The approval panel's decision form is left as it is: Approve and Reject belong beside what the approver reads (design-language 1 rule 5).
- Checks: static tests in `setup.test.tsx` for where each part lives; the browser journeys check the button is in the footer, in view, and sends the form (a static render draws no portal, and no DOM test library is in the stack).
