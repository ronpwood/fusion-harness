#!/bin/bash
# guard-secrets.sh — PreToolUse on Read|Grep|Glob|Bash.
# Denies reads/greps/globs/shell commands that target credential files. The pi children
# already get this via child-extensions/path-guard.ts; this covers the outer session.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT")

case "$TOOL" in
  Read|Grep|Glob)
    # Read: file_path. Grep/Glob: path (directory) and pattern (Grep's regex / Glob's pattern).
    for field in file_path path pattern glob; do
      val=$(jq -r ".tool_input.$field // empty" <<<"$INPUT")
      [ -z "$val" ] && continue
      if path_is_credential "$val"; then
        deny PreToolUse "Credential path blocked by guard-secrets hook: $val. Use .env.example for the shape; never read live secrets into the session."
      fi
    done
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
    if [ -n "$cmd" ] && bash_touches_credential "$cmd"; then
      deny PreToolUse "Shell command references a credential path and was blocked by guard-secrets hook. Use .env.example for the shape; never cat/source/grep live secrets."
    fi
    # `env`/`printenv` dumps leak whatever keys the session inherited.
    # Only at the start of a subcommand, so prose or heredoc text mentioning env is not matched.
    # `env FOO=bar cmd` (prefix form) is allowed; bare `env`, `env | ...`, `env -0` are not.
    if printf '%s' "$cmd" | grep -qE '(^|[;&|][[:space:]]*)(env|printenv)([[:space:]]*$|[[:space:]]*[;&|]|[[:space:]]+-)'; then
      deny PreToolUse "Environment dump blocked by guard-secrets hook (env/printenv can expose provider keys). Query one variable by name instead."
    fi
    ;;
esac
exit 0
