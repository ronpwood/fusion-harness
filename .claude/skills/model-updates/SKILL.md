---
name: model-updates
description: Check the fusion-harness model stacks for new, upgraded, repriced or retired models before launching, research the candidates, recommend swaps per slot role, and apply the ones the user approves. Use when the user asks to check for model updates, new models, new model releases, whether the stacks are current, or to update/refresh a stack's models. Triggers - model updates, new models, check models, update the stack, refresh models, pre-launch check, model-updates.
allowed-tools: Bash, Read, Edit, WebFetch, WebSearch, AskUserQuestion
---

# Model updates

Keep the YAML model stacks (`just fusion`, `fusion5`, `openrouter`, trio) current. The
deterministic part lives in `just models` / `just models-set`
(`extensions/fusion-harness/scripts/fh-models.js`); this skill adds the judgment: which
candidates are actually better for each slot's role, at what cost.

## Guardrail

The `guard-secrets` hook blocks Read/Grep/Glob/Bash on any `.pi/` path. **Never** read, grep,
cat or edit the stack files directly, and never pass a `.pi/` path in a command. Stack contents
come from `just models --json`; edits go through `just models-set`. Stacks are addressed by short
name — the part after `model-stack-` in the filename (`fusion`, `fusion-5`, `openrouter`, `trio`).
The hook's `\.key$` pattern also matches jq's `.key` token — write `keys[] as $k | .[$k]` instead
of `to_entries[] | .key` when filtering the JSON report.

## Workflow

1. **Check.** Run `just models --refresh --json`. The `--refresh` step runs
   `pi update --models` so the local catalog matches pi.dev. Note from the report:
   - `status: "missing"` slots — the stack will fail at launch; these come first.
   - `localVisible: false` — a clean-room child (scoped env: that provider's key only) can't see
     the model: key missing from `.env`, or a stale local catalog.
   - `upgrades[]` — same-family newer models with cost and context deltas.
   - `priceChange` — a slot's price moved since the last check.
   - `catalogChanges.<provider>.added` — new models in providers the stacks use. The family
     heuristic only catches version bumps; scan these for new families worth a slot
     (e.g. a new Kimi/GLM/Qwen line on Fireworks).
   - `pi.installed` vs `pi.latest`.

2. **Research** each upgrade candidate and any notable new model. pi's catalog (already in the
   report) gives price and context; add what it lacks:
   - Release date and whether it's GA, preview or experimental. Version numbers are not always
     chronological (OpenRouter's `grok-4.20` predates `grok-4.6`).
   - The provider's pricing page for priority/fast tiers and deprecation notices — e.g.
     `https://docs.fireworks.ai/serverless/pricing` (use its `llms.txt` index for other pages).
   - Release notes or benchmarks for a coding-agent workload: tool use, long-context coding,
     instruction following.

3. **Recommend** by slot role:
   - **architect** — frontier reasoning quality first; cost is secondary.
   - **main** (primary builder, the live host model) — fast, interactive, reliable tool use.
   - **builder** — cost-efficient coding throughput; diversity across providers/families is a
     feature of the fusion design, so don't collapse builders onto one model family.

   Present one table per stack: slot · role · current → candidate · $/M in/out (delta) ·
   context · one-line rationale. Say plainly when "keep current" is the better call.

4. **Confirm.** Use AskUserQuestion — one question per stack with changes, candidates as options
   plus "keep current". Apply nothing without approval.

5. **Apply** each approved swap: `just models-set <stack> <slot> <provider/id>`. The script
   refuses IDs missing from pi's catalog and re-validates the stack before writing.

6. **Sync docs.** Model names also appear in prose: the launch-recipe comments in `justfile`
   (e.g. `# THE fusion stack: rune=Fable 5 architect · flux=Gemini …`) and the stack
   descriptions in `README.md`. Update any that name a swapped model.

7. **Verify.** `just models` (swapped slots show OK with no UPGRADE), `npm test`,
   `git diff --stat`. If pi itself is behind, tell the user to run `pi update` — don't run it.
   Summarize what changed and what was deliberately left alone.
