#!/bin/bash
# block-destructive.sh — PreToolUse on Bash.
# Hard-denies history-rewriting / tree-wiping git commands and recursive deletes outside
# known lab and playground directories. Recursive deletes inside those directories are
# escalated to "ask" rather than allowed silently.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

INPUT=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
[ -z "$cmd" ] && exit 0

# --- git: never rewrite shared history or discard the working tree from the agent ---
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+(push[^;&|]*(--force|-f\b|--force-with-lease)|reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f|checkout[[:space:]]+--[[:space:]]+\.|restore[[:space:]]+\.|branch[[:space:]]+-D|stash[[:space:]]+(drop|clear))'; then
  deny PreToolUse "Destructive git command blocked by block-destructive hook: history rewrite or working-tree discard. Run it manually if intended."
fi

# --- rm: recursive/force deletes ---
# Split on separators so `cd x && rm -rf y` is still inspected per-subcommand.
IFS=$'\n'
for sub in $(printf '%s' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g'); do
  sub=$(printf '%s' "$sub" | sed -E 's/^[[:space:]]+//')
  # strip leading VAR=value assignments and sudo
  sub=$(printf '%s' "$sub" | sed -E 's/^([A-Za-z_][A-Za-z0-9_]*=[^ ]* +)*//; s/^sudo +//')
  case "$sub" in
    rm\ *) ;;
    *) continue ;;
  esac
  if ! printf '%s' "$sub" | grep -qE '(^| )-[a-zA-Z]*[rR]'; then continue; fi   # not recursive

  targets=()
  IFS=' ' read -ra toks <<<"$sub"
  for tok in "${toks[@]}"; do
    case "$tok" in rm|-*) continue ;; esac
    targets+=("$tok")
  done
  [ ${#targets[@]} -eq 0 ] && deny PreToolUse "Recursive rm with no explicit target blocked."

  for t in "${targets[@]}"; do
    case "$t" in
      /|/*|~|~/*|\$HOME*|.|..|./|../|\*|.git|.git/*|.pi|.pi/*|.claude|.claude/*|extensions|extensions/*|specs|specs/*|prompts|prompts/*|ai_docs|ai_docs/*|node_modules|node_modules/*)
        deny PreToolUse "Recursive rm of '$t' blocked by block-destructive hook. Only lab output directories may be removed recursively." ;;
    esac
    case "$t" in
      hooks20_*|duckdb20_*|agent_platform_lab*|../fusion-harness-v2-playground/*|dist|dist/*|build|build/*|.venv|.venv/*|coverage|coverage/*|*/tmp/*|/private/tmp/*)
        ;;  # known disposable output; still escalate below
      *)
        deny PreToolUse "Recursive rm of '$t' blocked by block-destructive hook: not a recognized lab/build output directory." ;;
    esac
  done
  ask "Recursive rm targets lab/build output (${targets[*]}). Confirm."
done
exit 0
