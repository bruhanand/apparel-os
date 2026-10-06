# S1-F01-T20 — Concurrency, isolation and leak suite

Status: blocked
Blocked by: T10, T13
Feature: [S1-F01 First access](../spec.md)

## Build

Integration tests on real PostgreSQL under the runtime role for the concurrency, isolation and leak cases of section 10

## Expected outputs

Tests

## Done when

`S1-F01-AT02`, `S1-F01-AT09`, `S1-F01-AT14`, `S1-F01-AT15`, `S1-F01-AT17` pass in CI

## Notes

- RR-191: concurrency suites on real PostgreSQL.
- RR-196: recheck the paired isolation tests when the integration run passes about two minutes.
