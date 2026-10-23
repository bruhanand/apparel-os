# S2-F11-T02 — The stage 2 reports

Status: in-progress
Blocked by: S2-F01-T04, S2-F02-T04, S2-F07-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Booking status, receipt problems, supplier fill rate and timeliness, and stock by product, size, location, condition and owner, with the definitions of [goods-in.md](../../../../design/goods-in/goods-in.md) 9.3 (`PRD-BKG-005`, `PRD-BKG-011`, `PRD-PRO-001`, `PRD-EXC-009`).
- Filters, drill-down to the records, as-of time, Unknown values marked, cost only with the permission, XLSX export (9.1; `PRD-EXC-010`, `PRD-EXC-011`).

## Expected outputs

Read models; routes, schemas, OpenAPI; report screens; integration tests on a synthetic data set.

## Done when

Each report's figures equal hand-worked expected values on a labelled synthetic data set; a scoped reader sees only permitted rows; every check passes.
