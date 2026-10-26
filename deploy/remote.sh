#!/usr/bin/env bash
# Runs on the VPS, from the source deploy.sh copied to /opt/apparel-os/src. Not run by hand except `tools`.
#   remote.sh up <host> <public-origin>   write/refresh .env, build, migrate, start
#   remote.sh add-org <code>              make a key for an Organisation (restarts app and worker)
#   remote.sh tools <command...>          one-off command in the app image, e.g. node dist/setup-organisation.js
set -euo pipefail

ROOT=/opt/apparel-os
ENV_FILE=$ROOT/.env
COMPOSE=(docker compose --project-directory "$ROOT/src/deploy" --env-file "$ENV_FILE" -f "$ROOT/src/deploy/compose.yaml")

secret() { openssl rand -hex 24; }

set_var() { # set_var NAME VALUE
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

has_var() { grep -q "^$1=" "$ENV_FILE"; }

ensure_env() {
  umask 077
  [ -f "$ENV_FILE" ] || : > "$ENV_FILE"
  for name in POSTGRES_PASSWORD AOS_MIGRATION_PASSWORD AOS_RUNTIME_PASSWORD MINIO_ROOT_PASSWORD; do
    has_var "$name" || set_var "$name" "$(secret)"
  done
  has_var MINIO_ROOT_USER || set_var MINIO_ROOT_USER "aos$(openssl rand -hex 4)"
  has_var AOS_ORGANISATION_KEYS || set_var AOS_ORGANISATION_KEYS "'{}'"
}

create_bucket() {
  "${COMPOSE[@]}" run --rm -T tools node --input-type=module -e "
    import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
    const s3 = new S3Client({ endpoint: process.env.AOS_FILE_STORE_ENDPOINT, region: process.env.AOS_FILE_STORE_REGION, forcePathStyle: true,
      credentials: { accessKeyId: process.env.AOS_FILE_STORE_ACCESS_KEY_ID, secretAccessKey: process.env.AOS_FILE_STORE_SECRET_ACCESS_KEY } });
    const Bucket = process.env.AOS_FILE_STORE_BUCKET;
    for (let i = 0; i < 30; i++) {
      try { await s3.send(new HeadBucketCommand({ Bucket })); console.log('bucket exists'); process.exit(0); } catch {}
      try { await s3.send(new CreateBucketCommand({ Bucket })); console.log('bucket created'); process.exit(0); } catch { await new Promise((r) => setTimeout(r, 2000)); }
    }
    console.error('could not reach the file store'); process.exit(1);
  "
}

case "${1:-}" in
  up)
    host=$2; origin=$3
    mkdir -p "$ROOT"
    ensure_env
    set_var AOS_HOST "$host"
    set_var AOS_PUBLIC_ORIGIN "$origin"
    "${COMPOSE[@]}" build app
    "${COMPOSE[@]}" up -d postgres minio
    "${COMPOSE[@]}" run --rm -T tools node dist/migrate.js
    create_bucket
    "${COMPOSE[@]}" up -d app worker caddy
    "${COMPOSE[@]}" ps
    ;;
  add-org)
    code=$2
    key=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
    current=$(grep '^AOS_ORGANISATION_KEYS=' "$ENV_FILE" | cut -d= -f2- | sed "s/^'//; s/'$//")
    merged=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d.setdefault(sys.argv[2], sys.argv[3]); print(json.dumps(d, separators=(",",":")))' "$current" "$code" "$key")
    set_var AOS_ORGANISATION_KEYS "'$merged'"
    "${COMPOSE[@]}" up -d app worker
    echo "key for $code is in $ENV_FILE; keep a copy of that file somewhere safe"
    ;;
  tools)
    shift
    exec "${COMPOSE[@]}" run --rm tools "$@"
    ;;
  *)
    echo "usage: remote.sh up <host> <public-origin> | add-org <code> | tools <command...>" >&2
    exit 2
    ;;
esac
