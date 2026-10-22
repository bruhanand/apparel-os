# S2-F02-T04 — Receive against a booking

Status: in-progress
Blocked by: S2-F02-T02, S2-F01-T04
Feature: [Stage 2 first version](../../spec.md)

## Build

- "Receive against booking": the Arrival names one booking of the same supplier and brand, Approved, Issued or Confirmed; its open lines show as the expected goods ([goods-in.md](../../../../design/goods-in/goods-in.md) 3.7, 4.1).
- At GRN issue each counted line links, through `booking`'s receipt link operation, to the one booking line whose style code matches, and whose colour and size match where the booking line gives them, ignoring case and spaces at the ends; any other line, and a GRN at a Site that is not the booking's destination, goes to Booking for review (`PRD-BKG-007`, `DEC-130`).
- Later linking of an unbooked GRN or a reviewed line by Booking, through `booking` (`PRD-BKG-008`).

## Expected outputs

`receiving` changes; routes and schemas; screens; integration tests.

## Done when

Design tests 5 and 6 pass with real GRNs; delivered quantities follow the links; every check passes.
