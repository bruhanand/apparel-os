# S1-F01-T13 — Approval rules, reasons and decisions

Status: blocked
Blocked by: T09, T11, T12
Feature: [S1-F01 First access](../spec.md)

## Build

Approval rule settings for access-change actions; the reason list and its free-text exception; Request approval with preparers; Decide with the fresh code, the rechecks and the version taking effect in the same transaction; supersession on material change; rejection back to the preparers (access-and-approvals 8, 9.1, 9.3, 9.5, 9.6, 9.11)

## Expected outputs

`access` approvals; tests

## Done when

Tests 12, 12a, 14 (access-change part), 19, 19b, 19f and 22 pass

## Notes

- RR-214: wording fixes for the 9.11 matrix and the user states (Active, Disabled, Ended).
- RR-215: what happens to an assignment whose user's first version is pending or rejected.
