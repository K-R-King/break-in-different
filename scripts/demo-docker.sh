#!/usr/bin/env bash
# Break In Different demo environment, Docker Compose version (the faster no-Docker version is scripts/demo.sh).
#   ./scripts/demo-docker.sh init    create .env.docker (generated secrets) and .env (your API keys, from .env.example)
#   ./scripts/demo-docker.sh up      start everything, deploy functions, seed data
#   ./scripts/demo-docker.sh keys    re-push API keys from .env to Convex (after editing .env)
#   ./scripts/demo-docker.sh reset   wipe the database and start fresh (demo reset)
#   ./scripts/demo-docker.sh down    stop everything (data kept)
#   ./scripts/demo-docker.sh logs    follow logs
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env.docker
KEYS_FILE=.env
DC=(docker compose --env-file "$ENV_FILE")

set_var() { # set_var KEY VALUE (in .env.docker); values may contain any character
  local tmp; tmp=$(mktemp)
  KEY="$1" VAL="$2" awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE" && rm -f "$tmp"
}

init() {
  if [ -f "$ENV_FILE" ]; then echo "$ENV_FILE already exists; keeping it."; return; fi
  cp .env.docker.example "$ENV_FILE"
  set_var CONVEX_INSTANCE_SECRET "$(openssl rand -hex 32)"
  set_var AGENT_SHARED_SECRET "$(openssl rand -hex 24)"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE (infrastructure secrets)."
  init_keys
}

init_keys() {
  if [ -f "$KEYS_FILE" ]; then return; fi
  cp .env.example "$KEYS_FILE" && chmod 600 "$KEYS_FILE"
  echo "Created $KEYS_FILE. Put ANTHROPIC_API_KEY, CARTESIA_API_KEY and APIFY_TOKEN there (optional: the app works without them)."
}

up() {
  [ -f "$ENV_FILE" ] || init
  init_keys
  "${DC[@]}" up -d --wait backend dashboard
  set_var CONVEX_SELF_HOSTED_ADMIN_KEY "$("${DC[@]}" exec -T backend ./generate_admin_key.sh | tail -1)"
  "${DC[@]}" run --rm --build deploy
  "${DC[@]}" up -d --build web agent
  echo
  local site; site=$(sed -n 's/^SITE_URL=//p' "$ENV_FILE")
  echo "Ready:  app ${site:-http://localhost:8080}   ·   Convex dashboard http://localhost:6791"
  echo "Health: $(curl -s http://127.0.0.1:3211/health)"
}

case "${1:-up}" in
  init) init ;;
  up) up ;;
  reset) "${DC[@]}" down -v && up ;;
  down) "${DC[@]}" down ;;
  logs) "${DC[@]}" logs -f ;;
  keys) "${DC[@]}" run --rm --build deploy ;;  # re-push .env keys to Convex after editing them
  admin-key) "${DC[@]}" exec -T backend ./generate_admin_key.sh | tail -1 ;;
  *) echo "usage: $0 init|up|keys|reset|down|logs|admin-key"; exit 1 ;;
esac
