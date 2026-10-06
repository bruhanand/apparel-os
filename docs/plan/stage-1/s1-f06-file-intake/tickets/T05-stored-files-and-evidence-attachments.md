# S1-F06-T05 — Stored files and evidence attachments

Status: blocked
Blocked by: S1-F01-T07 (audit and access records); S1-F01-T11 (roles, assignments and scope, for who may read a file)
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

The stored-file part of `files-imports`: files kept encrypted and write-once, served only through the app, and attached as evidence to any module's record ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 3.1 step 2, 9.2, section 11, 13.1, 15.1; [backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) 2.1, 3.3; [module-map.md](../../../../design/architecture/module-map.md) 4.7). Built right after S1-F01 (product owner, 6 Oct 2026, DEC-116).

- **Store a file** (3.1 step 2, 13.1; `PRD-IMP-002`): a command route in `files-imports` taking the bytes, the source system and the claimed document reference. The format is found from the content, never the extension (9.2, class A-1). This ticket accepts the evidence formats of 9.2, PDF, JPEG and PNG, kept as evidence only, with no layout; any other type is refused as not allowed before anything is stored. XLSX intake for imports is S1-F06-T01.
- **Encrypted, hashed and keyed by Organisation** (section 11; `PRD-SEC-006`, `POL-18.02`): the content hash is taken before encryption; the application encrypts the bytes with the Organisation's key (held outside the database, as for the authenticator secret of S1-F01-T08) before they reach file storage; the object key starts with the Organisation's identifier (GC9-10, approved 6 Oct 2026). MinIO locally and in tests, the Railway bucket on `dev` (code-house-rules 12.10). Tables `stored_file` (unique content hash, append-only, object key fixed, real format, restricted classes held) and `file_receipt` (append-only: uploader or service identity, time, source system, claimed reference, original name). The same bytes again add a receipt to the one stored file.
- **Write-once** (GC-9 3.3; `PRD-MOD-011`): the file-store adapter has no overwrite and no delete; an object is written once under its fixed key and never replaced or removed by the application. Deleting a file after its retention period is designed in S1-F14-T01, not built here; nothing is deleted while no period is set (`POL-18.05`).
- **No outside call inside a transaction** (code-house-rules 8.3; `PRD-INT-006`): the object is written before the transaction that records it, and the adapter refuses to run while the runner's in-transaction mark is set. An object whose record then fails to commit stays, as an object with no record (GC-9 3.3).
- **Attach** (13.1; 15.1 `attachment`; section 11): any module links a stored file to one of its records as evidence, inside that record's own transaction: the record type, record and version, what it evidences (a kind of evidence the module declares), who attached it and when. The attaching module declares the restricted classes each kind of evidence carries, and gives the record's scope facts (Site, Store, business unit, legal entity), kept on the attachment under row-level security (access-and-approvals 7.2). An attachment is never edited; one written in a transaction that rolls back leaves no link.
- **Read a file** (13.1, section 11; `PRD-SEC-005`): served only through the app, decrypted for a reader authorised for the record it is attached to and granted every restricted class it carries, never by a link straight to the bucket. Anyone else is refused and nothing is served. Downloading a file that holds a restricted class is an export and writes an access record ([numbering-and-audit.md](../../../../design/platform/numbering-and-audit.md) 5.1). Logs carry a file's hash and size only, never its content, a restricted value or a key (9.3; `PRD-SEC-014`).
- **API**: routes to store a file and to read an attached one, with their schemas (code-house-rules 12.1, 12.2). The screens that attach evidence are built by the tickets that use them.
- A test-only record type in a `test_` schema (code-house-rules 11.4) takes attachments in the tests.
- **Design edits in the same change**, unless the stage spec's documents step has made them: GC-6 15.1 (object keys start with the Organisation's identifier; objects are never overwritten or deleted; the attachment's columns: what it evidences, who, when, scope facts, restricted classes) and section 11 (how the reader's authority for the attached record is checked).

Evidence files are checked before they are stored (product owner, 6 Oct 2026, `DEC-117`): the type is found from the content, not the name, and must be one the evidence accepts (PDF, JPEG, PNG); a PDF with active content (scripts, embedded files, launch actions) is refused; size limits are chosen, documented and tested by the builders within the safeguards of imports-and-opening-data 9.3 (GC6-5, RR-036), and an oversized file is refused with the limit named, never truncated.

## Expected outputs

- `files-imports` with its `index.ts`; its first migration with `stored_file`, `file_receipt` and `attachment` and their `tables.json` entries; the S3-compatible file-store adapter
- Store and read routes with their schemas; tests against real PostgreSQL and MinIO

## Done when

- A stored object in MinIO is not the plaintext and its key starts with its Organisation's identifier; decrypted, the stored bytes equal the uploaded bytes and match the content hash taken before encryption
- The same bytes stored again add a receipt to the one stored file, keeping uploader, time, source system and reference, and write no second object; the adapter offers no way to overwrite or delete an object
- The adapter refuses to run inside a transaction; an attachment whose transaction rolls back leaves no link, and its object stays
- Synthetic PDF, JPEG and PNG files are stored; a file of another type is refused and nothing is stored
- An attachment records the record and its version, what it evidences, who attached it and when
- A file outside the reader's scope, or carrying a restricted class the reader is not granted, is refused and nothing is served; a restricted download writes an access record; no object is reachable except through the app
- A second synthetic Organisation is never served the other's file, and its objects sit under its own prefix
- No file content, restricted value or key appears in any log

A renamed file of another type, a PDF with active content and a file just over a size limit are each refused with the reason named, and nothing is stored (`DEC-117`)

## Notes

- Built right after S1-F01 so that mapping verification (S1-F02-T02), policy signature and validation (S1-F04-T01), the CA's evidence for book settings, posting maps and tax rules (S1-F09-T01, S1-F09-T02, S1-F09-T04), signed agreements (S1-F03-T03), and exceptions and approval decisions (S1-F08-T03) attach real files from the start (product owner, 6 Oct 2026, DEC-116). S1-F06-T01 and S1-F08-T03 build on it; S1-F14-T02 backs its files up.
- The safety refusals and caps of GC-6 9.3 (active content, uploaded and expanded size) are built in S1-F06-T02, later in the build order; they apply to evidence files too.
- RR-187: on `dev`, the Railway bucket is used only after the product owner authorises the Railway environment. Local work and CI need no Railway step.
- Deleting files after retention and key recovery are GC-9 questions for S1-F14-T01.
