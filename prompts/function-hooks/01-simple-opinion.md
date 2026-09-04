The Claude Code hooks reference (`ai_docs/function-hooks-20.md`) now documents five handler types (`command`, `http`, `mcp_tool`, `prompt`, `agent`), exec-form `args` versus shell-form `command`, the best-effort `if` permission-rule filter, `once`, `async`/`asyncRewake` background hooks, `PostToolBatch`, `PermissionDenied` with `retry`, the `"defer"` decision for SDK round-trips, `PreModelSwitch` cost guards, worktree hooks, MCP `Elicitation` hooks, and workspace-trust rules that differ between interactive and `-p` sessions.

Read-only task: choose the ONE MOST IMPORTANT capability from that reference that a team standardizing Claude Code guardrails across several repos should adopt first. Give:

1. your choice and why it has the highest immediate leverage;
2. a 15-minute experiment with a concrete `settings.json` fragment and, if needed, a hook script under 25 lines, plus the exact fixture JSON you would pipe into the script on stdin to prove it works without a live session;
3. one security or breaking-change check drawn from the reference (for example: the `if` filter is best-effort and not a hard deny; `-p` sessions treat the folder as trusted; `defer` is ignored on parallel tool calls);
4. the observable result that would change your recommendation.

Budget: under 600 words. Quote section headings from the reference when you cite a behavior so the reader can verify it.

FIRST read ai_docs/function-hooks-20.md. The "Hook lifecycle" table, "Hook handler fields", "Decision control", and "Security considerations" sections are the most relevant; do not summarize the whole file.
