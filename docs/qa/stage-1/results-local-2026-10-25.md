# Stage 1 manual QA results: local, 25 Oct 2026

> **Not ranked.** Results of [manual-qa.md](manual-qa.md), run by hand on local work against a freshly reset and seeded database. It decides nothing.

- **Where:** local work, web app at `http://localhost:5174`, API on port 3000, `AOS_ENVIRONMENT=local`, demo sign-in on for the four seeded people (`DEC-121`).
- **Commit:** `fdb45cb4`.
- **Local differences from the script:** the banner reads "Local work · SYNTHETIC data only", not "dev · …"; first users' temporary passwords are in `SYNTHETIC-local.secrets.json`; the API's `AOS_PUBLIC_ORIGIN` is the web app's address (`http://localhost:5174`), or every write is refused as coming from another site.
- **Who runs the cases:** the agent, in the built-in browser, with the test credentials and authenticator keys it keeps in `SYNTHETIC-local-qa.secrets.json` (ignored by git).

| Case | Result | Notes |
| --- | --- | --- |
| QA-01 | Pass | |
| QA-02 | Pass | A and P each set up the authenticator and chose a password; the mismatch message showed. P was signed in from `/setup/users`, so the app returned there instead of My work, as it should. |
