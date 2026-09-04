Create a decision-ready adoption memo at `HOOKS20_ADOPTION_MEMO.md` for a platform team that maintains shared Claude Code hook configurations across many repositories and plugins.

The memo must synthesize:

1. the opportunities in the current hooks reference: exec-form `args` with path placeholders, the `if` permission-rule filter, `once`, `async` and `asyncRewake` background hooks, `PostToolBatch`, `PermissionDenied` with `retry`, the `"defer"` decision for SDK-driven apps, `PreModelSwitch` cost confirmation, `WorktreeCreate`/`WorktreeRemove` replacement of git behavior, MCP tool hooks with `${path}` input substitution, and HTTP hooks with `allowedEnvVars`;
2. a migration-risk register for teams with existing shell-form hooks: quoting bugs that exec form removes, `${user_config.*}` failing in shell form, unlisted env vars becoming empty strings in HTTP headers, `if` being best-effort rather than an enforcement boundary, `defer` being silently ignored on parallel tool calls, async hooks having no deduplication, `SessionStart`/`Setup` firing before MCP servers connect, and `-p` sessions running repository hooks with no trust dialog;
3. three experiments ranked by learning value, each with a falsifiable success criterion that can be checked with a `claude --debug-file` log line or a stdin fixture run;
4. a "documented fact vs. our inference" table: anything about cost, latency, model choice for prompt hooks beyond "a fast model", or future stability of agent hooks is inference, not a guarantee.

Keep the memo under 1,500 words and cite the reference by section heading.

Fusion protocol requirement: all configured workers inspect and propose read-only; only the temporary FUSION agent writes the memo. After fusion, the complete fused memo/result must be sent back into every configured model's context using the no-action synchronization envelope. Each model must reply only `ACK FUSION <run-id>` and must not use tools, critique, revise, or continue the task during acknowledgement.

Source: FIRST read ai_docs/function-hooks-20.md.
