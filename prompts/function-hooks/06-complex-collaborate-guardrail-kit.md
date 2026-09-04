Collaboratively build `hooks20_guardrail_kit/`, a reproducible, shareable guardrail pack built on the Claude Code hooks reference, with a fixture-driven test harness that runs entirely offline.

The configured agents must first propose independently, then use architect-directed rounds to agree on a task graph. The graph should cover:

- a project-scoped `.claude/settings.json` fragment (delivered as `settings.json` inside the kit) that layers: a `PreToolUse` deny for destructive Bash under an `if: "Bash(rm *)"` filter; a `PermissionRequest` handler that auto-allows `npm run lint` and rewrites it via `updatedInput`; a `PostToolUseFailure` context injector; a `PreModelSwitch` hook that returns `"ask"` when `context_tokens` exceeds a threshold; and a `SessionEnd` audit-line appender. Every command hook must use exec form with `args`;
- a local HTTP hook target: a tiny Python standard-library server (`uv`-runnable single file) that receives a `PreToolUse` POST and answers with the JSON output format, plus a matching `http` handler entry using `headers` and `allowedEnvVars`. The runner must start it on a free localhost port, exercise it with a bounded `curl`, and stop it, all within 30 seconds;
- an `mcp_tool` handler documented in `settings.json` but marked `SKIP` in results when no MCP server is configured; never simulate a connected server;
- `fixtures/` with per-event JSON inputs copied in shape from the reference's input examples, including a `PostToolBatch` batch and a `PermissionDenied` input with and without a classifier verdict, so the `retry` rule can be tested;
- `test.sh` that pipes each fixture through its script, checks exact JSON with `jq`, verifies `once`, `timeout`, and `statusMessage` fields parse as documented, and prints a summary;
- a final `RESULTS.md` separating executed evidence, skipped checks, and design ideas. If a `claude` binary exists, one bounded `claude -p --debug-file` run may be recorded; otherwise the section says `SKIP`.

Every local validation command must be bounded to 60 seconds; do not run exhaustive filesystem searches, unbounded servers, or network downloads. Never claim a hook fired inside a live Claude Code session unless a debug log proves it.

Concurrency invariant: agents share one working directory and must never overwrite each other's work. Planning/review tasks may run in parallel with read-only tools. Any task that can mutate the project must run sequentially under the harness's single-writer scheduler, inspect the latest state, preserve previous changes, and leave a concrete handoff for the next agent. Do not create isolated git worktrees.

Source: FIRST read ai_docs/function-hooks-20.md.
