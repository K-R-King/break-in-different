#!/bin/sh
# Rebuild convex/seedData/snapshot.json from a fresh scrape of the curated boards.
# Reads the public Greenhouse and Lever APIs directly (they return listing HTML, which is where
# accommodation form links are found), runs at about 1 request per second, and keeps only the
# listings this run fetched, so the new snapshot replaces the old one.
# Needs the stack running (./scripts/demo.sh up).
set -eu
cd "$(dirname "$0")/.."
: "${CONVEX_SELF_HOSTED_URL:=http://127.0.0.1:3210}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:=$(grep '^CONVEX_SELF_HOSTED_ADMIN_KEY=' .env.docker | cut -d= -f2-)}"
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

SINCE=$(node -e 'process.stdout.write(String(Date.now()))')
# Four boards per call keeps each action well under Convex's 10-minute limit.
BOARD_GROUPS=$(npx convex run ingest/run:listBoards | node -e '
  const t = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (let i = 0; i < t.length; i += 4) console.log(JSON.stringify(t.slice(i, i + 4)));
')
echo "Scraping $(echo "$BOARD_GROUPS" | wc -l | tr -d ' ') groups of boards (about 1 to 2 minutes each)…"
echo "$BOARD_GROUPS" | while read -r G; do
  echo "  $G"
  npx convex run ingest/run:run "{\"boards\": $G, \"direct\": true}" </dev/null >/dev/null
done

OUT=convex/seedData/snapshot.json
npx convex run seed:exportSnapshot "{\"since\": $SINCE}" > "$OUT.tmp"
node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!s.listings?.length) { console.error("No listings exported; keeping the old snapshot."); process.exit(1); }
  const forms = s.listings.filter((l) => l.accommodationForm).length;
  console.log(`${s.listings.length} listings from ${s.employers.length} employers, ${forms} with an accommodation form.`);
' "$OUT.tmp" || { rm -f "$OUT.tmp"; exit 1; }
mv "$OUT.tmp" "$OUT"
echo "Wrote $OUT. Run ./scripts/demo.sh reset to load it into a fresh database."
