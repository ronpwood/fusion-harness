Build a Claude Code hooks migration-readiness kit in `hooks20_migration_kit/`.

The kit must contain:

- `README.md` with assumptions (which settings files are scanned, that no live session is required) and a non-destructive workflow: the kit reports, it never rewrites a user's settings;
- `inventory.py`, an Astral `uv` single-file script that scans a supplied directory for `settings.json`, `settings.local.json`, plugin `hooks.json`, and skill/agent frontmatter hook blocks, and reports constructs the current reference flags for review:
  - shell-form hooks whose `command` contains a `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, or `${CLAUDE_PLUGIN_DATA}` placeholder (candidate for exec form with `args`);
  - shell-form plugin hooks referencing `${user_config.*}` (documented as an error);
  - `if` values containing `&&`, `||`, or commas (only one rule is allowed per handler);
  - `http` hooks whose headers interpolate a variable not listed in `allowedEnvVars`;
  - `prompt` or `agent` handlers on events that do not support them, and `http`/`prompt`/`agent` handlers on `SessionStart` or `Setup`;
  - `async` or `asyncRewake` on non-command handlers;
  - `mcp_tool` handlers on `SessionStart`/`Setup` (will hit "not connected" on first run);
  - `Stop` hooks with no visible `stop_hook_active` guard in a referenced local script (cautious flag, not a confirmed break);
  - `defer` decisions in scripts alongside settings where the tool could be called in parallel (cautious flag);
- `fixtures/` with representative safe settings and script inputs that trigger each finding plus at least two clean configurations that produce no findings;
- `EXPECTED.md` explaining every finding and distinguishing "documented error or unsupported" from "cautious review flag";
- automated tests runnable without network access, without a `claude` binary, and within 60 seconds.

If a `claude` binary is locally available, add an optional capability probe that runs one bounded `claude -p --debug-file` session with a trivial `PostToolUse` hook and checks the log for the documented `Hook PostToolUse:Write ... success` line. If it is not available, the core inventory tests must still run and the probe must report `SKIP`, never a fabricated pass.

The acceptance gate must be designed before implementation and objectively verify every requested file, every finding category against its fixture, the clean-config negative cases, the test run, and honest probe status.

Source: FIRST read ai_docs/function-hooks-20.md, especially "Hook handler fields", "Exec form and shell form", "HTTP hook fields", "Prompt-based hooks" (event support lists), and "Run hooks in the background".
