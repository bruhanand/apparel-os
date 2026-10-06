# S1-F01-T05 — API conventions in code

Status: blocked
Blocked by: T04
Feature: [S1-F01 First access](../spec.md)

## Build

Validation from Zod, the error envelope and refusal codes, the idempotency-key requirement on writes, the version token, correlation identifier, generated OpenAPI and the typed client; the health endpoint moved onto them

## Expected outputs

Nest wiring; OpenAPI output; typed client; contract tests

## Done when

A write without a key is refused; every error matches the envelope; OpenAPI is generated in CI; the web app compiles against the typed client

## Notes

- RR-208: how a secret shown once is sent and described (house rules 12.6, `DEC-113`); built here and in T08.
