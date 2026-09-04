#!/bin/bash
# redact-secrets.sh — PostToolUse on Read|Grep|Bash.
# Output-side hard boundary for the outer session, mirroring modules/secret-guard.ts:
# every verbatim occurrence of a secret-shaped value is replaced with [REDACTED:<NAME>]
# before Claude sees the tool result. Values come from two sources:
#   1. the hook's own environment (whatever the Claude Code session inherited);
#   2. KEY=VALUE lines in $CLAUDE_PROJECT_DIR/.env (the file guard-secrets.sh denies
#      reading, so a value that reaches a tool result by any other route is still scrubbed).
# Replacement walks every string in tool_response, so the output shape is preserved and
# updatedToolOutput is accepted for any built-in tool.
set -euo pipefail

INPUT=$(cat)
NAME_RE='API[_-]?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY'
MIN_LEN=16

# Build a JSON array of {name,value} secrets.
secrets=$(
  {
    env | grep -iE "^[A-Za-z_0-9]*(${NAME_RE})[A-Za-z_0-9]*=" || true
    if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -f "$CLAUDE_PROJECT_DIR/.env" ]; then
      grep -vE '^\s*(#|$)' "$CLAUDE_PROJECT_DIR/.env" | sed -E 's/^export +//' | grep -iE "^[A-Za-z_0-9]*(${NAME_RE})[A-Za-z_0-9]*=" || true
    fi
  } | while IFS= read -r line; do
    name="${line%%=*}"; value="${line#*=}"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    [ ${#value} -lt $MIN_LEN ] && continue
    jq -n --arg n "$name" --arg v "$value" '{name:$n,value:$v}'
  done | jq -s 'unique_by(.value)'
)

[ "$(jq 'length' <<<"$secrets")" = "0" ] && exit 0

result=$(jq --argjson secrets "$secrets" '
  def scrub: reduce $secrets[] as $s (.; gsub($s.value | @text | gsub("[\\\\^$.|?*+()\\[\\]{}]"; "\\\\\(.)"); "[REDACTED:" + $s.name + "]"));
  .tool_response as $orig
  | ($orig | walk(if type == "string" then scrub else . end)) as $new
  | if $new == $orig then empty
    else {hookSpecificOutput:{hookEventName:"PostToolUse",updatedToolOutput:$new,
           additionalContext:"redact-secrets hook replaced one or more secret values in this tool result with [REDACTED:<NAME>]. Do not attempt to recover them."}}
    end
' <<<"$INPUT")

[ -n "$result" ] && printf '%s\n' "$result"
exit 0
