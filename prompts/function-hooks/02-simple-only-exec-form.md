The Claude Code hooks reference distinguishes two ways a command hook runs. **Exec form** applies when `args` is present: `command` is resolved as an executable and spawned directly with `args` as the argument vector, no shell involved, so path placeholders such as `${CLAUDE_PROJECT_DIR}` need no quoting. **Shell form** applies when `args` is omitted: the string goes to `sh -c` (or Git Bash / PowerShell on Windows), which tokenizes, expands, and needs quoting. Separately, the `if` field holds exactly one permission rule such as `Bash(git *)` and is matched best-effort: leading `VAR=value` assignments are stripped, each `&&` subcommand is checked, `$()` and backticks are inspected, and when Claude Code cannot tell what a command expands to it runs the hook anyway.

Explain to a developer, in under 350 words, when to choose exec form over shell form and why the reference says to use the permission system rather than an `if` filter for hard allow/deny. Then:

- rewrite this shell-form hook as exec form: `"command": "node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.js --fix"`;
- predict, for the `if` pattern `Bash(rm *)`, whether the hook runs on each of these Bash inputs and give the one-line reason: `FOO=1 rm -rf build`, `npm test && rm dist/x`, `echo $(date)`, `$TOOL rm x`;
- name the three environment variables both forms export to the spawned process.

This is a direct one-agent explanation. Do not create files, run tools, or perform setup. Use only the supplied launch context and clearly label anything the reference does not specify.

Source: ai_docs/function-hooks-20.md, sections "Common fields" (Bash `if` matching table) and "Exec form and shell form".
