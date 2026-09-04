#!/bin/bash
# lib.sh — shared helpers for fusion-harness Claude Code hooks.
# Sourced by the hook scripts; not a hook itself.

# deny <event> <reason>: emit a PreToolUse deny decision and exit 0.
deny() {
  jq -n --arg reason "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# ask <reason>: escalate a PreToolUse call to the user and exit 0.
ask() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$reason}}'
  exit 0
}

# Credential-path deny-list. Mirrors child-extensions/path-guard.ts for the pi children;
# this copy protects the outer Claude Code session. Matched case-insensitively against
# any path-like token. `.env.example` / `.env.template` are explicitly allowed.
CRED_PATTERNS=(
  '(^|/)\.env(\.[^/]*)?$'
  '(^|/)\.pi/'
  '(^|/)\.claude/(credentials|\.credentials)'
  '(^|/)\.aws/credentials'
  '(^|/)\.netrc$'
  '(^|/)\.npmrc$'
  '(^|/)\.pypirc$'
  '(^|/)\.docker/config\.json$'
  '(^|/)\.ssh/'
  '(^|/)id_(rsa|ed25519|ecdsa)(\.pub)?$'
  '\.(pem|p12|pfx|key)$'
  '(^|/)\.git-credentials$'
)

# path_is_credential <path>: 0 if the path matches the deny-list.
path_is_credential() {
  local p="$1" re
  case "$p" in *.env.example|*.env.template|.env.example|.env.template) return 1 ;; esac
  for re in "${CRED_PATTERNS[@]}"; do
    if printf '%s' "$p" | grep -qiE "$re"; then return 0; fi
  done
  return 1
}

# bash_touches_credential <command>: 0 if any whitespace-separated token in the command
# looks like a credential path. Also catches `source .env` / `. .env` / `export $(cat .env)`.
bash_touches_credential() {
  local cmd="$1" tok
  # normalize quotes/redirections so tokens split cleanly
  local cleaned
  cleaned=$(printf '%s' "$cmd" | tr "'\"<>|;&()\$" '          ')
  for tok in $cleaned; do
    tok="${tok#./}"
    if path_is_credential "$tok"; then return 0; fi
  done
  return 1
}
