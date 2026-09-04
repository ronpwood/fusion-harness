# Outer-session hooks: follow-ups (items 4 through 6)

Status: not started. Written 2026-09-04 after commit `fcb1d05` shipped items 1 through 3
(`.claude/hooks/`: guard-secrets, redact-secrets, block-destructive, check-writer-lease).

Context: these hooks protect the Claude Code session run *in this repo or the playground*.
The pi children spawned by the harness never see Claude Code hooks; their guards live in
`extensions/fusion-harness/child-extensions/path-guard.ts` and `modules/secret-guard.ts`.
Reference: `ai_docs/function-hooks-20.md`. Test pattern: `.claude/hooks/test.sh`.

## 4. Config tampering detection

**Gap.** `.pi/fusion-harness/model-stack-*.yaml` chooses providers, thinking levels, and
appended system prompts. Read-only workers cannot write them, but a FUSION agent or a
collaborate writer with full tools can. A silent edit there (different provider, an
exfiltrating system prompt path) would only show up at the next `git status`.

**Build.**
- `FileChanged` hook with `matcher` on the model-stack YAMLs, the shared communication
  contract `system_prompt_fixing_opus_5_great_communication.md`, and `.env`. Command hook,
  no decision control; emit `systemMessage` naming the file and a `git diff --stat` line.
- `ConfigChange` hook: `decision: "block"` with a reason if `.claude/settings.json` or
  the hooks directory changes mid-session, so a compromised writer cannot disable the
  guards it is running under.
- Fixtures: `FileChanged` input example in the reference (section "FileChanged input"),
  `ConfigChange` input (section "ConfigChange input"), one matching and one not.

## 5. Playground process hygiene

**Gap.** Prompt 06 starts a local HTTP hook server. Pi children and the writer lease
survive a Claude Code exit. Today you only find orphans and stale leases by remembering
to look.

**Build.**
- `SessionStart` hook: `additionalContext` listing any live lease for this cwd (same hash
  as `check-writer-lease.sh`), running `pi --mode json` processes, and untracked
  `hooks20_*` / `duckdb20_*` / `agent_platform_lab` directories. Command hook only;
  `SessionStart` does not accept http, prompt, or agent handlers.
- `SessionEnd` hook: report (never kill) orphaned pi processes, listening ports on
  localhost owned by lab servers, and dead-pid lease files. Side-effect only, no decision
  control on this event.
- Bound both to a few seconds; `SessionStart` runs before every session.

## 6. Untrusted `-p` runs

**Gap.** Per the reference's "Workspace trust" section, `claude -p` and SDK sessions never
show the trust dialog and run every hook committed in a repo's `.claude/settings.json`.
The playground holds scraped docs and output from five models. If anything ever scripts
`claude -p` over it, that content's hooks run with full user permissions.

**Not a hook. Record a rule:**
- Add to `CLAUDE.md` or the playground README: any `claude -p` over the playground or a
  scraped checkout uses `--bare` or disables hooks for that run, and `.claude/` is reviewed
  first.
- Optional guard: extend `block-destructive.sh` to deny `claude -p` invocations whose cwd
  argument is outside this repo unless `--bare` is present. Best-effort, like the rest.

## Order

4 first (cheapest, catches the scariest silent failure), then 5, then 6 as a doc change.
Each one gets fixtures in `.claude/hooks/fixtures/` and cases in `test.sh` before it is
wired into `settings.json`.
