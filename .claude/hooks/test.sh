#!/bin/bash
# test.sh — pipes every fixture through its hook and asserts the decision, exactly as
# Claude Code would deliver it on stdin. No live session needed.
# Run: .claude/hooks/test.sh   (regenerates fixtures via make-fixtures.sh first)
set -u
cd "$(dirname "$0")"
./make-fixtures.sh >/dev/null
export CLAUDE_PROJECT_DIR="$(cd ../.. && pwd)"
pass=0; fail=0
errf=$(mktemp)

# Fill in the real cwd so lease hashing matches.
for f in fixtures/*.json; do
  jq --arg c "$CLAUDE_PROJECT_DIR" '.cwd=$c' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

# expect <hook> <fixture> <deny|ask|allow>
expect() {
  local hook=$1 fx=$2 want=$3 out got rc
  out=$(./"$hook" < "fixtures/$fx.json" 2>"$errf"); rc=$?
  if [ -z "$out" ]; then got=allow
  else got=$(jq -r '.hookSpecificOutput.permissionDecision // "allow"' <<<"$out" 2>/dev/null || echo "bad-json"); fi
  [ $rc -ne 0 ] && got="exit$rc"
  if [ "$got" = "$want" ]; then pass=$((pass+1)); printf 'PASS %-24s %-20s %s\n' "$hook" "$fx" "$got"
  else fail=$((fail+1)); printf 'FAIL %-24s %-20s want=%s got=%s\n%s\n%s\n' "$hook" "$fx" "$want" "$got" "$out" "$(cat "$errf")"; fi
}

expect guard-secrets.sh read-env deny
expect guard-secrets.sh read-env-local deny
expect guard-secrets.sh read-env-example allow
expect guard-secrets.sh read-src allow
expect guard-secrets.sh grep-pi-dir deny
expect guard-secrets.sh glob-pem deny
expect guard-secrets.sh bash-cat-env deny
expect guard-secrets.sh bash-source-env deny
expect guard-secrets.sh bash-printenv deny
expect guard-secrets.sh bash-env-prefix allow
expect guard-secrets.sh bash-env-prose allow
expect guard-secrets.sh bash-env-pipe deny
expect guard-secrets.sh bash-ls allow
expect guard-secrets.sh bash-git-status allow

expect block-destructive.sh bash-rm-rf-root deny
expect block-destructive.sh bash-rm-rf-ext deny
expect block-destructive.sh bash-rm-rf-lab ask
expect block-destructive.sh bash-rm-file allow
expect block-destructive.sh bash-git-force deny
expect block-destructive.sh bash-git-reset deny
expect block-destructive.sh bash-git-clean deny
expect block-destructive.sh bash-git-status allow
expect block-destructive.sh bash-ls allow

# writer lease: no lock -> allow; live lock -> ask; dead-pid lock -> allow
lockroot=/tmp/fusion-harness-writer-locks; mkdir -p "$lockroot"
canon=$(cd "$CLAUDE_PROJECT_DIR" && pwd -P)
key=$(printf '%s' "$canon" | shasum -a 256 | cut -c1-24)
lock="$lockroot/$key.lock"
if [ -f "$lock" ]; then echo "SKIP writer-lease tests: a real lease exists at $lock"; else
  expect check-writer-lease.sh write-src allow
  sleep 300 & holder=$!
  jq -n --argjson pid $holder --arg c "$canon" '{owner:"test",pid:$pid,command:"fh-fusion (test)",cwd:$c,createdAt:0}' > "$lock"
  expect check-writer-lease.sh write-src ask
  expect check-writer-lease.sh bash-redirect ask
  expect check-writer-lease.sh bash-git-status allow
  kill $holder 2>/dev/null; wait $holder 2>/dev/null
  expect check-writer-lease.sh write-src allow
  rm -f "$lock"
fi

# redaction: secret from env must be scrubbed; clean output must produce no JSON
export FIXTURE_API_KEY="sk-fixture-SECRET-VALUE-0123456789"
out=$(./redact-secrets.sh < fixtures/post-bash-secret.json)
if jq -e '.hookSpecificOutput.updatedToolOutput.stdout == "key is [REDACTED:FIXTURE_API_KEY] ok" and .hookSpecificOutput.updatedToolOutput.isImage == false' <<<"$out" >/dev/null 2>&1; then
  pass=$((pass+1)); printf 'PASS %-24s %-20s %s\n' redact-secrets.sh post-bash-secret redacted-from-env
else fail=$((fail+1)); echo "FAIL redact-secrets.sh post-bash-secret: $out"; fi
out=$(./redact-secrets.sh < fixtures/post-bash-clean.json)
if [ -z "$out" ]; then pass=$((pass+1)); printf 'PASS %-24s %-20s %s\n' redact-secrets.sh post-bash-clean passthrough
else fail=$((fail+1)); echo "FAIL redact-secrets.sh post-bash-clean: $out"; fi
unset FIXTURE_API_KEY
tmpproj=$(mktemp -d); printf 'FILE_SECRET_TOKEN="sk-fixture-SECRET-VALUE-0123456789"\n' > "$tmpproj/.env"
out=$(CLAUDE_PROJECT_DIR="$tmpproj" ./redact-secrets.sh < fixtures/post-bash-secret.json)
if jq -e '.hookSpecificOutput.updatedToolOutput.stdout | test("REDACTED:FILE_SECRET_TOKEN")' <<<"$out" >/dev/null 2>&1; then
  pass=$((pass+1)); printf 'PASS %-24s %-20s %s\n' redact-secrets.sh post-bash-secret redacted-from-dotenv
else fail=$((fail+1)); echo "FAIL redact-secrets.sh dotenv source: $out"; fi
rm -rf "$tmpproj"; rm -f "$errf"

echo; echo "passed=$pass failed=$fail"
[ $fail -eq 0 ]
