#!/usr/bin/env bash
# Builds standalone executables using Node's built-in Single Executable
# Applications (SEA) feature — no Bun required, just Node 20+.
#
# Usage: bash scripts/build-sea.sh
# Output: dist/terminal-mafia-server(.exe) and dist/terminal-mafia-client(.exe)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p dist build

# server.mjs pulls in game/lib/*.mjs via relative imports, which won't
# resolve once packed into a single-file SEA executable. Inline them first.
# (client.mjs only imports Node built-ins, so it needs no bundling.)
node scripts/bundle-server.mjs

build_one() {
  local NAME="$1"      # server | client
  local ENTRY="$2"      # path to .mjs entry point
  local BLOB="build/$NAME.blob"
  local CONFIG="build/$NAME-sea-config.json"
  local OUT="dist/terminal-mafia-$NAME"

  echo "==> Building $NAME"

  cat > "$CONFIG" <<EOF
{
  "main": "$ENTRY",
  "output": "$BLOB",
  "disableExperimentalSEAWarning": true
}
EOF

  node --experimental-sea-config "$CONFIG"
  cp "$(command -v node)" "$OUT"

  # postject requires the 'postject' package on PATH; npx will fetch it once.
  npx --yes postject "$OUT" NODE_SEA_BLOB "$BLOB" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    $( [ "$(uname)" = "Darwin" ] && echo "--macho-segment-name NODE_SEA" )

  chmod +x "$OUT"
  echo "==> Wrote $OUT"
}

build_one "server" "build/server.bundle.mjs"
build_one "client" "game/client.mjs"

echo ""
echo "Done. Run with:"
echo "  ./dist/terminal-mafia-server [port]"
echo "  ./dist/terminal-mafia-client [host] [port]"
