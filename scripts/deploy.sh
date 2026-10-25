#!/bin/sh
# Pushes functions, server env vars and the seed. Runs inside the `deploy` container
# (scripts/demo-docker.sh) or on the host (scripts/demo.sh).
set -eu
: "${CONVEX_SELF_HOSTED_URL:?}" "${CONVEX_SELF_HOSTED_ADMIN_KEY:?run ./scripts/demo.sh up}"
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
# The CLI directly, not npx: newer npm versions echo npx command lines. Secret values always go
# through stdin, never the command line, so they cannot appear in output or the process list.
convex() { node_modules/.bin/convex "$@"; }

echo "Pushing Convex functions…"
convex deploy -y --typecheck disable

setenv() { [ -n "${2:-}" ] && printf '%s' "$2" | convex env set "$1" >/dev/null && echo "  set $1" || true; }
echo "Setting server environment variables…"
setenv SITE_URL "${SITE_URL:-http://localhost:8080}"
setenv AGENT_SHARED_SECRET "${AGENT_SHARED_SECRET:-}"
setenv CLAUDE_MODEL_EXTRACT "${CLAUDE_MODEL_EXTRACT:-claude-haiku-5-5}"
setenv CLAUDE_MODEL_WRITE "${CLAUDE_MODEL_WRITE:-claude-sonnet-5-5}"
# Optional keys from .env: set when present, removed when empty so the fallback is used.
EXISTING=$(convex env list 2>/dev/null | sed 's/=.*//')
optional() {
  if [ -n "${2:-}" ]; then setenv "$1" "$2"
  elif printf '%s\n' "$EXISTING" | grep -qx "$1"; then convex env remove "$1" >/dev/null && echo "  removed $1 (fallback in use)"
  else echo "  $1 not set (fallback in use)"; fi
}
optional ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
optional CARTESIA_API_KEY "${CARTESIA_API_KEY:-}"
optional CARTESIA_VOICE_ID "${CARTESIA_VOICE_ID:-}"
optional APIFY_TOKEN "${APIFY_TOKEN:-}"
optional MOCK_AI "${MOCK_AI:-}"
optional SCHEDULED_INGEST "${SCHEDULED_INGEST:-}"
if ! convex env list 2>/dev/null | grep -q "^JWKS"; then
  echo "  generating Convex Auth keys"
  KEYS=$(node scripts/generate-keys.mjs)
  printf '%s' "$KEYS" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).JWT_PRIVATE_KEY)' | convex env set JWT_PRIVATE_KEY >/dev/null
  printf '%s' "$KEYS" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).JWKS)' | convex env set JWKS >/dev/null
fi

echo "Seeding DEMO data and the listings snapshot…"
convex run seed:demo
echo "Deploy finished."
