# S1-F01-T12 — Inbox and My work

Status: blocked
Blocked by: T06, T11
Feature: [S1-F01 First access](../spec.md)

## Build

Work items published, updated and closed from `access` events through the outbox; List my work with eligibility checked at read; ordering by due time then exposure with Unknown above known; no due time while routing has no rows (access-and-approvals 11)

## Expected outputs

`inbox` module; tests

## Done when

Test 20 passes; a replayed event makes no second item; an ineligible reader sees nothing
