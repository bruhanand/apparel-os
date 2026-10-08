# S1-F06-T06 — Protected download and encrypted receipt names

Status: done
Blocked by: S1-F06-T05 (done)
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

Two answers of the product owner of 8 Oct 2026 on the stored files of S1-F06-T05 ([open-items.md](../../../open-items.md) RR-432, RR-433).

- **A restricted download is a protected action** (RR-432; `PRD-SEC-001`; [access-and-approvals.md](../../../../design/access/access-and-approvals.md) 3.3; [code-house-rules.md](../../../../design/platform/code-house-rules.md) 12.1): the download route of a file whose attachment carries a restricted class takes a fresh authenticator code, checked the way the other protected actions check it (freshness as 3.3 says, no duration chosen), before anything is fetched or served. A missing or stale code is refused and nothing is served; the access records per class are written as now. A file with no restricted class is served as now, without a code.
- **Original name and claimed reference encrypted** (RR-433; `PRD-SEC-006`; [imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) sections 11 and 15.1): the receipt's original file name and claimed document reference are encrypted with the Organisation key, the way S1-F06-T05 encrypts the file, before the receipt row is written, and decrypted only when an authorised reader is served the file through the app. `file_receipt` stays append-only; its `tables.json` entry says what is now readable without row-level security (hash, size, format, times, uploader). Logs never carry the name or reference.
- **Design edits in the same change**: GC-6 section 11 (the protected download; the receipt fields encrypted) and 15.1 (the `file_receipt` columns).

## Expected outputs

- A migration changing the `file_receipt` columns to hold the encrypted name and reference; its `tables.json` entry
- The download route's schema with the code field; `openapi.json` regenerated
- Tests against real PostgreSQL and MinIO

## Done when

- A restricted download without a code, or with a code already used, is refused and serves nothing and writes no access record; with a fresh code it serves the file and writes the access record per class
- A file with no restricted class is read without a code
- In the database, a receipt's original name and claimed reference are not the plaintext; served through the app to an authorised reader, they decrypt to what was uploaded
- Neither appears in any log

## Notes

- Built 8 Oct 2026 on `s1/f06-file-intake`: `3a3d50b`, review fixes `dbb021c`. A restricted download takes a fresh code, checked before the object is fetched and taken in the command's transaction before any access record; every download asks for a new code while the freshness setting stays OPEN (GC3-6). The receipt's name and reference are sealed under their own key purpose. Review fixes: the sealed columns folded into migration 0024 (never applied outside developer machines and CI), so `dev` needs no interruption; each attachment links the receipt it came from, and a reader is served only that receipt, never other uploads of the same bytes; one shared fresh-code refusal in `access`.
