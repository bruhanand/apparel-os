# Deploy

The VPS (Hostinger KVM 2) runs PostgreSQL, the file store (MinIO), `app`, `worker` and Caddy in Docker Compose. Vercel
serves the built web app and forwards `/api/*` and `/counter/*` to the VPS, so the browser sees one origin. GitHub only
runs the checks (`.github/workflows/code-check.yml`); every deploy is run from the laptop with `deploy/deploy.sh`.

## One-time setup

On the VPS (Ubuntu): install Docker (`curl -fsSL https://get.docker.com | sh`), open ports 80 and 443 (and 22), and
make sure the laptop can `ssh` in without a password. Python 3 and OpenSSL are on Ubuntu already.

On the laptop: `npm i -g vercel`, `vercel login`, then `vercel link` in the repository root (the project's default
domain, `https://<project>.vercel.app`, is the app's address). Copy `deploy/deploy.env.example` to `deploy/deploy.env`
and fill in the three values.

## Deploy

```sh
git checkout main && git pull
deploy/deploy.sh
```

It refuses unless you are on a clean, pushed `main` whose GitHub checks are green. It copies the commit to the VPS,
builds the image there, runs the migrations, starts the services, then builds and deploys the web app to Vercel.
Secrets (database passwords, Organisation keys, file store keys) are generated on the VPS into `/opt/apparel-os/.env`
the first time and never leave it; keep a copy of that file.

## Operator commands

```sh
ssh <vps> bash /opt/apparel-os/src/deploy/remote.sh add-org <ORGANISATION-CODE>            # key for a new Organisation
ssh <vps> bash /opt/apparel-os/src/deploy/remote.sh tools node dist/setup-organisation.js /path/in/container.json
```

The other commands of `AGENTS.md` ("Code workspace") run the same way: `remote.sh tools node dist/<command>.js`.
Logs: `ssh <vps> docker compose -p aos logs -f app worker`.

## What to know

- Settings come from `deploy/compose.yaml`; the server and worker read the same ones as on Railway before
  (`docs/design/platform/deployment.md`). `AOS_TRUSTED_PROXY_HOPS` is 2 (Vercel, then Caddy).
- Vercel may limit the size of a request body and how long a response can stay open. Test a large import upload and
  the live-update stream (`/api/kernel/live`) through the Vercel address first.
