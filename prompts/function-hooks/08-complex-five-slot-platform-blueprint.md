Using all five configured model slots, create `HOOKS20_PLATFORM_BLUEPRINT.md`: a technically critical blueprint for an organization-wide Claude Code hook governance platform built on the current hooks reference.

The blueprint must integrate:

- a layered settings strategy across managed, user, project, local, plugin, and skill/agent hook locations, with the documented dedup rule (same handler in multiple settings files runs once; plugin and skill copies stay separate);
- a central `http` validation service for `PreToolUse` and `PermissionRequest`, including `allowedEnvVars` token handling, the response-handling differences from command hooks, and timeout behavior;
- the `"defer"` round-trip for an internal Agent SDK app: `stop_reason: "tool_deferred"`, resume with `--resume`, re-fired `PreToolUse`, `updatedInput`, the single-tool-call constraint, `tool_deferred_unavailable`, and `cleanupPeriodDays` retention;
- `PermissionDenied` `retry` semantics in auto mode, including the case where no classifier verdict exists;
- `PostToolBatch` as the place for once-per-batch context rather than per-tool `PostToolUse`;
- a `PreModelSwitch` cost guard with `deny > ask > allow` precedence and the surfaces where `"ask"` degrades;
- `WorktreeCreate`/`WorktreeRemove` hooks that replace git behavior for background sessions and subagents, and how `${CLAUDE_PROJECT_DIR}` behaves inside a worktree;
- `Elicitation`/`ElicitationResult` policy for MCP servers that request user input;
- `async`/`asyncRewake` test and deploy hooks, with the no-deduplication and next-turn-delivery limitations;
- audit and observability via `SessionStart`, `SessionEnd`, `Notification`, `ConfigChange`, and `claude --debug-file` logs;
- an explicit boundary around what the reference does NOT establish: agent-hook stability, prompt-hook cost and latency, the exact fast model used, multi-hook conflict resolution beyond the documented precedence rules, and workspace-trust behavior for `-p` runs over untrusted repositories.

Include an architecture, event/data flow, threat-and-failure table (with at least: hook runs with full user permissions, best-effort `if`, unlisted env var becomes empty string, repository hooks running in `-p` without trust), phased rollout roadmap, rollback strategy, and ten falsifiable questions that must be answered before organization-wide adoption. Keep the blueprint under 3,000 words and cite the reference by section heading.

Five-slot fusion protocol: every configured worker contributes independently with read-only tools; the temporary FUSION agent is the only process allowed to modify the CWD and must author the canonical blueprint. The final fused result must synchronize back to all five model contexts with exact acknowledgement evidence.

Source: FIRST read ai_docs/function-hooks-20.md.
