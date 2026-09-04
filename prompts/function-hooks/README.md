# Claude Code Hooks Reference Fusion Harness Validation Prompts

Live/paid validation prompts for the fusion-harness multi-model work, built on the Claude Code hooks reference checked in at `ai_docs/function-hooks-20.md`. Run them in numeric order, simple to complex. Do not invent inline agent prompts in the smoke or Herdr workflows; load the corresponding file verbatim.

Source document: `ai_docs/function-hooks-20.md` (upstream: https://code.claude.com/docs/en/hooks)

| Order | Prompt | Complexity | Intended command | Primary harness behavior |
|---:|---|---|---|---|
| 1 | `01-simple-opinion.md` | Simple | `/fh-opinion` | N-way read-only fan-out and responsive comparison |
| 2 | `02-simple-only-exec-form.md` | Simple | `/fh-only` armed mode | One-shot slot routing and auto-disarm |
| 3 | `03-medium-debate-llm-hooks.md` | Medium | `/fh-debate --rounds 2` | Existing pairwise read-only debate regression |
| 4 | `04-medium-fusion-hook-lab.md` | Medium | `/fh-fusion` | N read-only workers; temporary FUSION is sole CWD writer |
| 5 | `05-medium-fusion-adoption-memo.md` | Medium | `/fh-fusion` | Full fused-result synchronization and exact ACK fan-out |
| 6 | `06-complex-collaborate-guardrail-kit.md` | Complex | `/fh-collaborate --rounds 1` | N-agent planning plus scheduler-enforced single writer |
| 7 | `07-complex-auto-validate-migration-kit.md` | Complex | `/fh-auto-validate` | Architect/Main gate-first regression |
| 8 | `08-complex-five-slot-platform-blueprint.md` | Complex | Five-slot `/fh-fusion` | Maximum stack, N-source attribution, sole-writer delivery |

The suite spans the five handler types (`command`, `http`, `mcp_tool`, `prompt`, `agent`), exec form vs. shell form, the best-effort `if` filter, `once`/`async`/`asyncRewake`, per-event decision control (`PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolBatch`, `Stop`, `PreModelSwitch`), the `"defer"` SDK round-trip, worktree and elicitation hooks, and the workspace-trust and security rules.

## Differences from the DuckDB suite

These prompts inherit the DuckDB v2.0 suite's structure but tighten a few things:

- **One source convention.** Every prompt says `FIRST read ai_docs/function-hooks-20.md` and names the sections that matter. The reference is ~3,800 lines, so section pointers keep workers from re-summarizing the whole file. The DuckDB set mixed a URL and a local file across prompts.
- **Offline, fixture-driven validation.** Hooks are stdin-JSON-in, JSON-out scripts, so labs and kits (04, 06, 07) test by piping the reference's own input examples into scripts and asserting output with `jq`. No live Claude Code session or API credential is required for a pass. A `claude` binary, if present, may add one bounded `--debug-file` smoke; if absent the result is `SKIP`, never a fabricated pass.
- **Explicit budgets.** Word caps, per-round caps, and the 60-second command bound appear in the prompt text rather than being implied.
- **Documented-vs-inferred boundary named per prompt.** The reference is explicit about what is experimental (agent hooks), best-effort (`if`), and unsupported per event, so prompts require agents to cite section headings rather than paraphrase from memory.
