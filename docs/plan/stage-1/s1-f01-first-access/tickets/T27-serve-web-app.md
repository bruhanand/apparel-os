# S1-F01-T27 — The `app` service serves the web app

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- **The web app at `/` from the one origin** (deployment.md sections 2 and 3; code-house-rules 12.1; `PRD-SEC-001`). The Railway `dev` setup found that the server serves only the API (railway-roles-runbook "Done on `dev`"). The server serves the built `apps/web` from the same origin as `/api/`: every `GET` or `HEAD` of a path outside `/api/` answers the file of the build at that path, or, for a client route, the web app's `index.html`, so a reload or a link to a screen opens it.
- **`/api/` stays the API.** An unknown path under `/api/` answers the error envelope (code-house-rules 12.3), never `index.html`; every `/api` answer keeps `Cache-Control: no-store` (12.1 "No caching"; `PRD-SEC-006`).
- **Cache headers.** The build's hashed files (`/assets/`) may be kept by a browser for a long time and never change; `index.html` is never kept (`no-store`), so a deploy reaches the next page load; other files, such as the self-hosted fonts, are revalidated.
- **Security headers** on every answer: a content security policy that lets a page load scripts, styles, fonts, images and API calls only from its own origin and be framed by no site, with `nosniff` and no referrer sent elsewhere (code-house-rules 12.1, one origin and no cross-origin loads; deployment.md section 3). A design choice, written into deployment.md section 3.
- **`/counter/` is not built yet** (`apps/counter` does not exist; offline-counter 5.2): it answers not-found until the counter ticket adds it.
- **The build.** `pnpm build` on Railway produces `apps/web/dist`, where the server finds it; the server refuses to start without the web app's `index.html`. The web build reads `AOS_ENVIRONMENT` (deployment.md section 1; RR-193), so the Turborepo cache keys on it.
- **The browser journeys** run against the real one-origin server instead of `vite preview`, so they prove the serving and its headers.
- No migration. No setting value is chosen here.

## Expected outputs

The server's web app serving in the kernel's HTTP part; `main.ts` wiring; the Turborepo build input; the journeys' server serving the web app; deployment.md section 3 and the runbook updated; tests.

## Done when

- Integration tests over HTTP: `/` answers the web app's `index.html` with `no-store` and the security headers; a client route answers the same `index.html`; a hashed asset answers with the long cache; `/api/unknown` answers the not-found envelope, not `index.html`; `/counter/` answers not-found; a missing asset answers not-found, not `index.html`.
- The browser journeys pass against the one-origin server, with no content security policy violation on the pages they open.
- The full check set and the browser journeys pass.

## Notes

- Built on branch `s1/f01-t27` (commit subject `S1-F01-T27: the app service serves the web app`). `serveWebApp(app, directory)` in `apps/server/src/kernel/http/web-app.ts`, called by `main.ts` with `apps/web/dist`; the security headers are set for every answer in `configureApp`. No package added: Nest's `useStaticAssets` (Express's static serving).
- Tests: `apps/server/src/kernel/http/web-app.test.ts` (HTTP, synthetic build); `apps/web/e2e/one-origin.spec.ts`; the sign-in journey now fails on any content security policy violation (`e2e/support/security-policy.ts`). The journeys run against the one-origin server (`test/browser/serve.ts` serves `apps/web/dist`); `vite preview` is no longer started.
- The web build's Turborepo cache keys on `AOS_ENVIRONMENT` (`turbo.json`, `@apparel-os/web#build`).
- Follow-up: RR-420 (`/counter/` when `apps/counter` is built).
