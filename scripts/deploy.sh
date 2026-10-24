#!/bin/sh
# Runs inside the `deploy` container (docker compose run --rm deploy).
set -eu
: "${CONVEX_SELF_HOSTED_URL:?}" "${CONVEX_SELF_HOSTED_ADMIN_KEY:?run ./scripts/demo.sh up}"
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

echo "Pushing Convex functions…"
npx convex deploy -y --typecheck disable

setenv() { [ -n "${2:-}" ] && npx convex env set "$1" -- "$2" >/dev/null && echo "  set $1" || true; }
echo "Setting server environment variables…"
setenv SITE_URL "${SITE_URL:-http://localhost:8080}"
setenv AGENT_SHARED_SECRET "${AGENT_SHARED_SECRET:-}"
setenv ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
setenv CLAUDE_MODEL_EXTRACT "${CLAUDE_MODEL_EXTRACT:-claude-haiku-5-5}"
setenv CLAUDE_MODEL_WRITE "${CLAUDE_MODEL_WRITE:-claude-sonnet-5-5}"
setenv CARTESIA_API_KEY "${CARTESIA_API_KEY:-}"
setenv CARTESIA_VOICE_ID "${CARTESIA_VOICE_ID:-}"
setenv APIFY_TOKEN "${APIFY_TOKEN:-}"
setenv MOCK_AI "${MOCK_AI:-}"
if ! npx convex env list 2>/dev/null | grep -q "^JWKS"; then
  echo "  generating Convex Auth keys"
  KEYS=$(node scripts/generate-keys.mjs)
  npx convex env set JWT_PRIVATE_KEY -- "$(printf '%s' "$KEYS" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).JWT_PRIVATE_KEY)')" >/dev/null
  npx convex env set JWKS -- "$(printf '%s' "$KEYS" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).JWKS)')" >/dev/null
fi

echo "Seeding DEMO data and the listings snapshot…"
npx convex run seed:demo
echo "Deploy finished."
