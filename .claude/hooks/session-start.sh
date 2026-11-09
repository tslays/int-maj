#!/bin/bash
# Put the Node that .nvmrc names first on PATH for the whole session.
# Cloud containers ship several Nodes and default to an older one (22), so
# `npm test` would stop at its version guard. Nothing is installed or
# downloaded: if the right Node is already first, or none is found, this does
# nothing.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

want="$(tr -dc '0-9' < .nvmrc)"
have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$have" -ge "$want" ] && exit 0

for dir in "/opt/node$want/bin" "${NVM_DIR:-/opt/nvm}"/versions/node/v"$want".*/bin; do
  if [ -x "$dir/node" ]; then
    [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export PATH=\"$dir:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    echo "Using Node $("$dir/node" --version) from $dir (.nvmrc asks for $want)." >&2
    exit 0
  fi
done
echo "No Node $want found; npm test needs it (see .nvmrc)." >&2
