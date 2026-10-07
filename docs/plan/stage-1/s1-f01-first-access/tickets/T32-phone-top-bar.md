# S1-F01-T32 — Phone-width top bar as designed

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- At phone width the top bar holds the menu, the logo slot and My work only; the person's name and the profile menu move to the bottom of the left drawer (design-language 6D)

## Done when

- A component test at phone width shows the top bar without the name and the drawer with the profile
- Checked by hand at 375 px: nothing wraps or overlaps
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F5.
- The design already decided this; the code did not follow it.
- Built: below 640 px (Tailwind `sm`, the phone width the drawer already uses) the top bar holds the menu (44 px), the logo slot and My work; the theme switch, name and profile menu are hidden there and the open left drawer ends with the profile (name, personas held, theme, Sign out). The profile renders once at a time, so the browser journeys find one "Profile". Component test in `apps/web/src/shell/shell.test.tsx`; the 375 px check is a browser journey step.
