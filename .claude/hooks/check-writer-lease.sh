#!/bin/bash
# check-writer-lease.sh — PreToolUse on Write|Edit|MultiEdit|NotebookEdit|Bash.
# The harness serializes project mutation through a lock file that
# modules/writer-lease.ts creates at
#   /tmp/fusion-harness-writer-locks/<sha256(realpath cwd)[0:24]>.lock
# with {owner,pid,command,cwd,createdAt}. If a live harness process holds that lease for
# this cwd, an outer-session edit would race the FUSION agent / collaborate scheduler.
# This hook escalates such edits to "ask" with the lease owner in the reason. It never
# takes the lease itself and never deletes stale ones.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT")
CWD=$(jq -r '.cwd // empty' <<<"$INPUT")
[ -z "$CWD" ] && exit 0

if [ "$TOOL" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
  # Only shell commands that plausibly mutate the tree. Read-only shell is not gated.
  if ! printf '%s' "$cmd" | grep -qE '(>|>>|\btee\b|\bmv\b|\bcp\b|\brm\b|\bmkdir\b|\btouch\b|\bsed[[:space:]]+-[a-zA-Z]*i|\bgit[[:space:]]+(commit|add|checkout|switch|merge|rebase|stash|apply|cherry-pick|rm|mv)|\bnpm[[:space:]]+(install|i|ci|uninstall)|\buv[[:space:]]+(add|remove|sync)|\bchmod\b|\bpatch\b)'; then
    exit 0
  fi
fi

LOCK_ROOT=/tmp/fusion-harness-writer-locks
[ -d /tmp ] || LOCK_ROOT="${TMPDIR:-/tmp}/fusion-harness-writer-locks"
[ -d "$LOCK_ROOT" ] || exit 0

canon=$( (cd "$CWD" 2>/dev/null && pwd -P) || printf '%s' "$CWD")
if command -v shasum >/dev/null 2>&1; then
  key=$(printf '%s' "$canon" | shasum -a 256 | cut -c1-24)
else
  key=$(printf '%s' "$canon" | sha256sum | cut -c1-24)
fi
lock="$LOCK_ROOT/$key.lock"
[ -f "$lock" ] || exit 0

pid=$(jq -r '.pid // empty' "$lock" 2>/dev/null || true)
owner_cmd=$(jq -r '.command // "unknown"' "$lock" 2>/dev/null || echo unknown)
created=$(jq -r '.createdAt // empty' "$lock" 2>/dev/null || true)

if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  ask "fusion-harness writer lease is held by pid $pid ($owner_cmd) for this directory. Editing now would race the harness's single writer. Wait for it to finish, or confirm to proceed anyway."
fi
# Lock file exists but owner is gone: informational only, harness reclaims it on next acquire.
exit 0
