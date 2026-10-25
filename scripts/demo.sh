#!/usr/bin/env bash
# Break In Different demo environment without Docker (fastest start; Docker version: scripts/demo-docker.sh).
# Runs the open-source Convex backend binary (the build the Docker image uses), the Convex dashboard,
# the web app and the matching agent as local processes. State lives in .demo-local/ (gitignored).
#   ./scripts/demo.sh up          download what is missing, start everything, deploy functions, seed data
#   ./scripts/demo.sh keys        re-push API keys from .env to Convex (after editing .env)
#   ./scripts/demo.sh reset       wipe the database and start fresh (demo reset)
#   ./scripts/demo.sh down        stop everything (data kept)
#   ./scripts/demo.sh stop-agent  stop only the matching agent (fallback rehearsal)
#   ./scripts/demo.sh logs        follow logs
#   ./scripts/demo.sh admin-key   print the Convex admin key (dashboard login, npx convex)
# Needs Node 22.12+, curl, unzip and openssl. Python 3.11+ is optional: without it matching uses its fallback.
# Full list: README "Requirements".
set -euo pipefail
cd "$(dirname "$0")/.."

# Pinned: the backend revision (65a9491) the Docker image ran on 2026-10-24.
CONVEX_BACKEND_VERSION=${CONVEX_BACKEND_VERSION:-precompiled-2026-10-23-65a9491}
RELEASES=https://github.com/convex/convex-backend/releases/download/$CONVEX_BACKEND_VERSION
STATE=.demo-local
ENV_FILE=$STATE/env
KEYS_FILE=.env
RUN=$STATE/run
LOGS=$STATE/logs
DATA=$STATE/data
BIN_DIR=$STATE/bin/$CONVEX_BACKEND_VERSION
BACKEND=$BIN_DIR/convex-local-backend
DASHBOARD=$STATE/dashboard/$CONVEX_BACKEND_VERSION
INSTANCE_NAME=break-in-different
CLOUD=http://127.0.0.1:3210
SITE=http://127.0.0.1:3211

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "$1 is required"; }
running() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
read_var() { sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -1; } # read_var FILE KEY (not exported)

wait_for() { # wait_for URL SECONDS NAME
  local i
  for ((i = 0; i < $2 * 5; i++)); do curl -sf -o /dev/null "$1" && return 0; sleep 0.2; done
  die "$3 did not start; see $LOGS/$3.log"
}

load_env() { # load_env FILE: export its KEY=VALUE lines without evaluating them as shell
  [ -f "$1" ] || return 0
  local line k v
  while IFS= read -r line || [ -n "$line" ]; do
    [[ $line == *=* && $line != '#'* ]] || continue
    k=${line%%=*} v=${line#*=}
    [[ $k =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    case $v in \"*\") v=${v#\"} v=${v%\"} ;; \'*\') v=${v#\'} v=${v%\'} ;; esac
    export "$k=$v"
  done < "$1"
}

platform() {
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) echo aarch64-apple-darwin ;;
    Darwin-x86_64) echo x86_64-apple-darwin ;;
    Linux-aarch64 | Linux-arm64) echo aarch64-unknown-linux-gnu ;;
    Linux-x86_64) echo x86_64-unknown-linux-gnu ;;
    *) die "no prebuilt Convex backend for $(uname -s) $(uname -m); use ./scripts/demo-docker.sh" ;;
  esac
}

fetch_zip() { # fetch_zip URL DIR: download and unpack, replacing DIR only when complete
  local tmp
  tmp=$(mktemp -d "$STATE/tmp.XXXXXX")
  curl -fsSL --retry 3 -o "$tmp/download.zip" "$1"
  unzip -q "$tmp/download.zip" -d "$tmp/out"
  mkdir -p "$(dirname "$2")" && rm -rf "$2" && mv "$tmp/out" "$2" && rm -rf "$tmp"
}

pick_python() { # the agent's Docker image uses 3.11; prefer the closest available, 3.11 or newer
  local p
  for p in python3.11 python3.12 python3.13 python3; do
    command -v "$p" >/dev/null && "$p" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null && { echo "$p"; return; }
  done
}

check_node() { # Vite needs Node 20.19+ or 22.12+; we document and test 22.12+
  node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' ||
    die "Node 22.12 or newer is required (found $(node --version))"
}

init() {
  mkdir -p "$RUN" "$LOGS" "$DATA"
  if [ ! -f "$ENV_FILE" ]; then
    (umask 077 && printf 'CONVEX_INSTANCE_SECRET=%s\nAGENT_SHARED_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" > "$ENV_FILE")
    echo "Created $ENV_FILE (infrastructure secrets)."
  fi
  if [ ! -f "$KEYS_FILE" ]; then
    cp .env.example "$KEYS_FILE" && chmod 600 "$KEYS_FILE"
    echo "Created $KEYS_FILE. Put ANTHROPIC_API_KEY, CARTESIA_API_KEY and APIFY_TOKEN there (optional: the app works without them)."
  fi
}

# Pushes functions, server env vars and the seed. Only this subshell reads the sponsor keys in .env.
deploy() {
  (
    load_env "$KEYS_FILE"
    export CONVEX_SELF_HOSTED_URL=$CLOUD
    CONVEX_SELF_HOSTED_ADMIN_KEY=$(read_var "$ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)
    AGENT_SHARED_SECRET=$(read_var "$ENV_FILE" AGENT_SHARED_SECRET)
    export CONVEX_SELF_HOSTED_ADMIN_KEY AGENT_SHARED_SECRET
    sh scripts/deploy.sh
  ) 2>&1 | tee "$LOGS/deploy.log"
}

# Background: creates agent/.venv on first run, then starts the agent once the functions are deployed.
start_agent() {
  local py
  py=$(pick_python)
  [ -n "$py" ] || { echo "No Python 3.11+: matching uses the built-in fallback."; return; }
  (
    trap '' HUP
    if [ ! -x agent/.venv/bin/python ]; then
      "$py" -m venv agent/.venv && agent/.venv/bin/pip install -q --disable-pip-version-check -r requirements.txt || {
        rm -rf agent/.venv
        echo "agent install failed: matching uses the built-in fallback"
        exit 1
      }
    fi
    for ((i = 0; i < 600; i++)); do curl -sf -o /dev/null "$SITE/health" && break; sleep 0.5; done
    CONVEX_SITE_URL=$SITE AGENT_SHARED_SECRET=$(read_var "$ENV_FILE" AGENT_SHARED_SECRET) \
      nohup sh -c 'cd agent && exec .venv/bin/python main.py' > "$LOGS/agent.log" 2>&1 &
    echo $! > "$RUN/agent.pid"
  ) > "$LOGS/agent-setup.log" 2>&1 &
  echo $! > "$RUN/agent-setup.pid"
}

stop() { # stop NAME...
  local name pid i
  for name in "$@"; do
    if running "$name"; then
      pid=$(cat "$RUN/$name.pid")
      if [ "$name" = backend ]; then kill -INT "$pid"; else kill "$pid"; fi
      for ((i = 0; i < 50; i++)); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$RUN/$name.pid"
  done
}

down() { stop agent-setup agent web dashboard backend; }

up() {
  need node && need npm && need curl && need unzip && need openssl
  check_node
  init
  down
  local p asset pid_backend="" pid_dashboard="" pid_npm="" pid_web
  for p in 3210 3211 6791 8080; do
    port_busy "$p" && die "port $p is in use (is the Docker demo running? ./scripts/demo-docker.sh down)"
  done
  asset=$(platform)

  # Downloads and installs run in parallel.
  if [ ! -x "$BACKEND" ]; then
    echo "Downloading the Convex backend ($CONVEX_BACKEND_VERSION)…"
    fetch_zip "$RELEASES/convex-local-backend-$asset.zip" "$BIN_DIR" & pid_backend=$!
  fi
  if [ ! -f "$DASHBOARD/index.html" ]; then
    echo "Downloading the Convex dashboard…"
    fetch_zip "$RELEASES/dashboard.zip" "$DASHBOARD" > "$LOGS/dashboard-download.log" 2>&1 & pid_dashboard=$!
  fi
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    echo "Installing npm packages…"
    npm ci --no-audit --no-fund > "$LOGS/npm.log" 2>&1 & pid_npm=$!
  fi

  [ -z "$pid_backend" ] || wait "$pid_backend" || die "backend download failed"
  if [ -z "$(read_var "$ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)" ]; then
    printf 'CONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$("$BACKEND" keygen admin-key --instance-name "$INSTANCE_NAME" \
      --instance-secret "$(read_var "$ENV_FILE" CONVEX_INSTANCE_SECRET)")" >> "$ENV_FILE"
  fi
  echo "Starting the Convex backend…"
  DISABLE_BEACON=true DOCUMENT_RETENTION_DELAY=172800 RUST_LOG=info nohup "$BACKEND" \
    --interface 127.0.0.1 --port 3210 --site-proxy-port 3211 --convex-origin "$CLOUD" --convex-site "$SITE" \
    --instance-name "$INSTANCE_NAME" --instance-secret "$(read_var "$ENV_FILE" CONVEX_INSTANCE_SECRET)" \
    --local-storage "$DATA/storage" "$DATA/convex_local_backend.sqlite3" > "$LOGS/backend.log" 2>&1 &
  echo $! > "$RUN/backend.pid"

  [ -z "$pid_npm" ] || wait "$pid_npm" || die "npm ci failed; see $LOGS/npm.log"
  start_agent
  VITE_CONVEX_URL=$CLOUD npx vite build > "$LOGS/web-build.log" 2>&1 & pid_web=$!
  wait_for "$CLOUD/version" 60 backend
  deploy

  wait "$pid_web" || die "web build failed; see $LOGS/web-build.log"
  nohup node scripts/serve-static.mjs --root dist --port 8080 --spa --headers docker/nginx.conf > "$LOGS/web.log" 2>&1 &
  echo $! > "$RUN/web.pid"
  [ -z "$pid_dashboard" ] || wait "$pid_dashboard" || die "dashboard download failed; see $LOGS/dashboard-download.log"
  (umask 077 && printf '{"name":"%s","url":"%s","adminKey":"%s"}\n' "$INSTANCE_NAME" "$CLOUD" \
    "$(read_var "$ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)" > "$STATE/deployment.json")
  nohup node scripts/serve-static.mjs --root "$DASHBOARD" --port 6791 --deployment "$STATE/deployment.json" > "$LOGS/dashboard.log" 2>&1 &
  echo $! > "$RUN/dashboard.pid"
  wait_for http://127.0.0.1:8080/ 10 web

  echo
  echo "Ready:  app http://localhost:8080   ·   Convex dashboard http://localhost:6791"
  echo "Health: $(curl -s "$SITE/health")"
  echo "The matching agent starts in the background (first run installs it; see $LOGS/agent-setup.log)."
}

case "${1:-up}" in
  init) init ;;
  up) up ;;
  reset) down && rm -rf "$DATA" && up ;;
  down) down ;;
  stop-agent) stop agent-setup agent ;;
  logs) tail -n 50 -F "$LOGS"/*.log ;;
  keys) running backend || die "not running; start with ./scripts/demo.sh up"; deploy ;;
  admin-key) read_var "$ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY ;;
  *) echo "usage: $0 init|up|keys|reset|down|stop-agent|logs|admin-key"; exit 1 ;;
esac
