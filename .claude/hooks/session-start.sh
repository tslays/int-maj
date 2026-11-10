#!/bin/bash
# Prepare a cloud session: the right Node, and the type checker.
#
# 1. Put the Node that .nvmrc names first on PATH for the whole session.
#    Cloud containers ship several Nodes and default to an older one (22), so
#    `npm test` would stop at its version guard.
# 2. Install the dev-only type checker (`npm run typecheck`) if it is missing.
#    The game and `npm test` need no install; a failure here is only reported.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

want="$(tr -dc '0-9' < .nvmrc)"
have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"

if [ "$have" -lt "$want" ]; then
  found=""
  for dir in "/opt/node$want/bin" "${NVM_DIR:-/opt/nvm}"/versions/node/v"$want".*/bin; do
    if [ -x "$dir/node" ]; then
      [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export PATH=\"$dir:\$PATH\"" >> "$CLAUDE_ENV_FILE"
      export PATH="$dir:$PATH"
      echo "Using Node $("$dir/node" --version) from $dir (.nvmrc asks for $want)." >&2
      found=1
      break
    fi
  done
  [ -z "$found" ] && echo "No Node $want found; npm test needs it (see .nvmrc)." >&2
fi

if [ ! -x node_modules/.bin/tsc ]; then
  npm ci --silent --no-audit --no-fund >&2 || echo "npm ci failed; npm run typecheck will not work until it succeeds." >&2
fi
exit 0
