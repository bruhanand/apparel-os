# S2-F02-T05 — Recount

Status: blocked
Blocked by: S2-F02-T03, S2-F04-T02 (the GRN's "PT attached" mark is built there)
Feature: [Stage 2 first version](../../spec.md)

## Build

- A linked recount of a GRN's lines, proposed with a reason and approved by a different person; it adds or reverses receipt counts for the difference and keeps the original count ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.7; `PRD-REC-019`).
- Refused once a PT is uploaded for the GRN. `receiving` keeps a "PT attached" mark on the GRN, which `merchandise` · PT sets at submit and clears at withdrawal, rejection or reversal (`S2-F04-T02`, `S2-F06-T01`, `S2-F09-T01`); this ticket builds the mark and its refusal.

## Expected outputs

`receiving` changes; routes and schemas; the screen; integration tests.

## Done when

A recount corrects custody with the original kept; the recounter cannot approve their own; a recount is refused while the mark is set; every check passes.
