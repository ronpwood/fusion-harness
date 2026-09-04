Design and build a compact, offline hook-script lab in `hooks20_fusion_lab/` that teaches four documented decision patterns from the Claude Code hooks reference. The lab must be testable by piping fixture JSON into each script on stdin, exactly as Claude Code would, so it needs no live Claude Code session:

- `PreToolUse` on `Bash`: deny `rm -rf` via `hookSpecificOutput.permissionDecision: "deny"` with a reason, and otherwise exit 0 with no decision;
- `PostToolUse` on `Read`: redact a fake secret pattern from the result using `updatedToolOutput`;
- `PostToolBatch`: inject a single `additionalContext` string summarizing which files the batch touched, reading the `tool_calls` array;
- `Stop`: block completion with top-level `decision: "block"` and a `reason` when a marker file `.tests-failed` exists, and pass otherwise. Include the `stop_hook_active` guard so the hook cannot loop.

Required canonical deliverables:

- `hooks20_fusion_lab/README.md` — prerequisites (`jq`, bash), what each script demonstrates, how the fixture-driven runner mirrors real hook I/O, expected observations, and cleanup;
- `hooks20_fusion_lab/settings.example.json` — a valid `hooks` block wiring all four scripts in exec form with `args` and `${CLAUDE_PROJECT_DIR}` placeholders, one matcher group per event;
- `hooks20_fusion_lab/hooks/*.sh` — the four executable scripts, each under 40 lines, quoting every shell variable;
- `hooks20_fusion_lab/fixtures/*.json` — at least one matching and one non-matching input per event, using the field names from the reference's per-event input examples;
- `hooks20_fusion_lab/run.sh` — pipes every fixture through its script, asserts the exact JSON output or exit code with `jq`, prints PASS/FAIL per case, and exits non-zero on any failure. Every command must complete within 60 seconds total. If a `claude` binary is on `PATH`, optionally run one bounded `claude -p --debug-file` smoke and report what the debug log shows; if it is absent, print `SKIP: no claude binary` and never fabricate a pass.

Fusion protocol requirement: parallel model workers are researchers/planners only and must not modify the project. The temporary FUSION agent is the sole writer and must synthesize their results, create the canonical files, inspect them, run `run.sh`, and report the real output. Never claim a hook fired inside Claude Code unless the debug-log smoke actually ran.

Source: FIRST read ai_docs/function-hooks-20.md, sections "Hook input and output", "Decision control", "PreToolUse", "PostToolUse", "PostToolBatch", and "Stop".
