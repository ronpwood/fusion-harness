Debate this claim using the Claude Code hooks reference:

> Now that Claude Code ships prompt hooks (`type: "prompt"`) and agent hooks (`type: "agent"`) with tool access, teams should replace their scripted command hooks with LLM-evaluated guardrails as the default enforcement layer.

Ground the debate in these documented facts: prompt hooks send the hook input plus a prompt to a fast model and get back structured JSON; agent hooks spawn a subagent that can Read, Grep, and Glob for up to 50 turns and return `{ "ok": true/false }`; thirteen events accept all five handler types while the remaining events accept only `command`, `http`, and `mcp_tool`; default timeouts are 30 seconds for `prompt` and 60 for `agent`; all matching hooks run in parallel.

Also confront what the reference explicitly warns or does NOT establish: agent hooks are marked experimental and the reference says to prefer command hooks for production; the `if` filter is best-effort and the permission system is named as the place for hard allow/deny; `SessionStart` and `Setup` accept no prompt or agent hooks at all; there is no documented cost, latency, or determinism guarantee for model-evaluated decisions; `-p` and SDK sessions run repository hooks without a trust dialog.

Remain read-only. Re-verify every cited behavior against `ai_docs/function-hooks-20.md` by section name, but do not change files or install software. Each round is capped at 400 words per side. In the closing statement, sort the claim's use cases into three buckets: "command hook is the right tool," "prompt hook is a credible complement," and "agent hook is an experiment, not a default," and state one falsifiable test for each bucket.

Source: FIRST read ai_docs/function-hooks-20.md, sections "Prompt-based hooks", "Agent-based hooks", "Common fields", and "Security considerations".
