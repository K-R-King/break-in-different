#!/usr/bin/env bash
# Break In Different demo environment (Docker Compose).
#   ./scripts/demo.sh init    create .env.docker with fresh secrets (then add your API keys)
#   ./scripts/demo.sh up      start everything, deploy functions, seed data
#   ./scripts/demo.sh reset   wipe the database and start fresh (demo reset)
#   ./scripts/demo.sh down    stop everything (data kept)
#   ./scripts/demo.sh logs    follow logs
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env.docker
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
  echo "Created $ENV_FILE. Add ANTHROPIC_API_KEY, CARTESIA_API_KEY and APIFY_TOKEN (optional: the app works without them)."
}

up() {
  [ -f "$ENV_FILE" ] || init
  "${DC[@]}" up -d --wait backend dashboard
  set_var CONVEX_SELF_HOSTED_ADMIN_KEY "$("${DC[@]}" exec -T backend ./generate_admin_key.sh | tail -1)"
  "${DC[@]}" run --rm --build deploy
  "${DC[@]}" up -d --build web agent
  echo
  echo "Ready:  app http://localhost:8080   ·   Convex dashboard http://localhost:6791"
  echo "Health: $(curl -s http://127.0.0.1:3211/health)"
}

case "${1:-up}" in
  init) init ;;
  up) up ;;
  reset) "${DC[@]}" down -v && up ;;
  down) "${DC[@]}" down ;;
  logs) "${DC[@]}" logs -f ;;
  admin-key) "${DC[@]}" exec -T backend ./generate_admin_key.sh | tail -1 ;;
  *) echo "usage: $0 init|up|reset|down|logs|admin-key"; exit 1 ;;
esac
