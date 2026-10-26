#!/usr/bin/env bash
# The deploy, run from this laptop (CD is local; GitHub only runs the checks). From the repository root:
#   deploy/deploy.sh            checks, then the VPS, then Vercel
#   deploy/deploy.sh --server   the VPS only
#   deploy/deploy.sh --web      Vercel only
# Needs deploy/deploy.env (see deploy.env.example), ssh access to the VPS, and for the web part the Vercel CLI,
# logged in and linked once (`vercel link`). See deploy/README.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

[ -f deploy/deploy.env ] || { echo "deploy/deploy.env is missing (copy deploy/deploy.env.example)" >&2; exit 1; }
# shellcheck disable=SC1091
. deploy/deploy.env
: "${VPS_SSH:?}" "${VPS_HOST:?}" "${VERCEL_URL:?}"
REMOTE=/opt/apparel-os

do_server=1; do_web=1
case "${1:-}" in
  --server) do_web=0 ;;
  --web) do_server=0 ;;
  "") ;;
  *) echo "usage: deploy/deploy.sh [--server|--web]" >&2; exit 2 ;;
esac

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Deploy from main." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "The working tree is not clean." >&2; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main differs from origin/main: push or pull first." >&2; exit 1; }
sha=$(git rev-parse HEAD)
state=$(gh run list --commit "$sha" --workflow code-check.yml --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)
[ "$state" = "completed success" ] || { echo "The checks for $sha are not green (got: ${state:-none}). Wait for CI." >&2; exit 1; }

if [ "$do_server" = 1 ]; then
  echo "==> VPS: copying $sha"
  ssh "$VPS_SSH" "mkdir -p $REMOTE/src && find $REMOTE/src -mindepth 1 -delete"
  git archive --format=tar HEAD | ssh "$VPS_SSH" "tar -x -C $REMOTE/src"
  echo "==> VPS: build, migrate, start"
  ssh "$VPS_SSH" "bash $REMOTE/src/deploy/remote.sh up '$VPS_HOST' '$VERCEL_URL'"
fi

if [ "$do_web" = 1 ]; then
  echo "==> Vercel"
  sed "s#__VPS_HOST__#$VPS_HOST#g" deploy/vercel.template.json > vercel.json
  trap 'rm -f vercel.json' EXIT
  vercel pull --yes --environment=production
  vercel build --prod
  vercel deploy --prebuilt --prod
fi
echo "Done: $VERCEL_URL"
