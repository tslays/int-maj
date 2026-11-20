#!/bin/bash
# Download the photos a problem-report issue names, from the private R2 store,
# through the Worker route GET /api/report-photo/<key> on int-dev.
#
#   .claude/skills/issue/photos.sh <issue-number> <key> [<key> ...]
#
# Pass the keys in the issue's order ("Photo 1 of N", "Photo 2 of N", ...).
# Each photo is saved as $ISSUE_DIR/<issue>/photo-<k>.jpg (ISSUE_DIR defaults
# to /tmp/int-maj-issues) and checked: HTTP 200, a JPEG, not empty, and not a
# copy of another key's photo. The session's network proxy adds the bearer
# token for int-dev.mah-jong.workers.dev; never put a token in this script,
# a command line or a chat.
#
# Exit 0: every photo saved and checked; the last lines list the files to
# open with the Read tool. Exit 1: something failed; the FAIL lines say what.
set -uo pipefail

HOST="https://int-dev.mah-jong.workers.dev"
KEY_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

if [ "$#" -lt 2 ] || ! [[ "$1" =~ ^[0-9]+$ ]]; then
  echo "usage: $0 <issue-number> <key> [<key> ...]" >&2
  echo "The keys are the UUIDs in the issue's 'Photo k of N ... (not public): \`<key>\`' lines." >&2
  exit 2
fi

issue="$1"; shift
dir="${ISSUE_DIR:-/tmp/int-maj-issues}/$issue"
mkdir -p "$dir"
failed=0
saved=()
declare -A seen=()

k=0
for raw in "$@"; do
  k=$((k + 1))
  key="$(printf '%s' "$raw" | tr -d '`"'"'"' \r\n')"
  file="$dir/photo-$k.jpg"
  if ! [[ "$key" =~ $KEY_RE ]]; then
    echo "FAIL photo $k: '$raw' is not a photo key (expected a lowercase UUID v4)"
    failed=1; continue
  fi
  code=""
  for attempt in 1 2 3; do
    code="$(curl -sS --max-time 30 -o "$file" -w '%{http_code}' "$HOST/api/report-photo/$key" 2>"$dir/curl-$k.err")"
    case "$code" in 200|404) break ;; esac
    sleep $((attempt * 2))
  done
  if [ "$code" != "200" ]; then
    echo "FAIL photo $k ($key): HTTP ${code:-none} $(tr '\n' ' ' < "$dir/curl-$k.err")"
    [ "$code" = "404" ] && echo "     404 = no such key, photo expired (kept 30 days), or the proxy sent no token for int-dev."
    rm -f "$file"; failed=1; continue
  fi
  rm -f "$dir/curl-$k.err"
  magic="$(head -c 3 "$file" | od -An -tx1 | tr -d ' \n')"
  size="$(wc -c < "$file" | tr -d ' ')"
  if [ "$magic" != "ffd8ff" ] || [ "$size" -lt 1000 ]; then
    echo "FAIL photo $k ($key): not a JPEG (first bytes $magic, $size bytes)"
    failed=1; continue
  fi
  hash="$(sha256sum "$file" | cut -c1-16)"
  if [ -n "${seen[$hash]:-}" ]; then
    echo "FAIL photo $k ($key): the same image as photo ${seen[$hash]}; the store is not returning this report's own photo. Say so; do not triage from the note alone."
    failed=1; continue
  fi
  seen[$hash]=$k
  echo "OK   photo $k of $# ($key): $size bytes"
  saved+=("$file")
done

echo
if [ "${#saved[@]}" -gt 0 ]; then
  echo "Open each of these with the Read tool and look at it:"
  printf '  %s\n' "${saved[@]}"
fi
if [ "$failed" -ne 0 ]; then
  echo "RESULT: FAILED - not every photo was fetched and checked."
  exit 1
fi
echo "RESULT: all $# photo(s) of issue #$issue fetched and checked."
