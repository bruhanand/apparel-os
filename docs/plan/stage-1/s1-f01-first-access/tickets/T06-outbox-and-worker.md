# S1-F01-T06 — Outbox and worker

Status: blocked
Blocked by: T03, T08 (its internal service identity)
Feature: [S1-F01 First access](../spec.md)

## Build

The outbox table written in the business transaction; the worker as a second start command of the same build, using pg-boss under an internal service identity; consumer registration and receipts; the retry rule of the house rules ([deployment.md](../../../../design/platform/deployment.md) section 2)

## Expected outputs

Kernel outbox and worker; tests

## Done when

A rolled-back command leaves no outbox row; a redelivered event has one effect
