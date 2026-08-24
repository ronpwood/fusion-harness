Collaboratively build `agent_ops_eval/`, a reproducible evaluation harness for teams deciding how to use the GA computer use, browser use, Skills API, and Files API capabilities — without requiring a live Claude Platform credential.

The configured agents must first propose independently, then use architect-directed rounds to agree on a task graph. The graph should cover:

- a synthetic targeting simulator that compares coordinate-based action resolution (computer use) against structure-based resolution (browser use) over a small fixture set of UI element descriptions, reporting resolution/fallback counts — explicitly labeled as a structural simulation of the announced behavior difference, never a live benchmark of the real tools;
- a skill-folder validator that checks a candidate skill directory against the announced anatomy (instructions file, at least one script, at least one template) and flags anything that assumes a host filesystem or network access inconsistent with running inside Claude's code-execution sandbox;
- a Files API usage-pattern linter that flags code re-sending full file contents on every call instead of uploading once and referencing by ID, and flags any assumption that uploaded files persist indefinitely given the announced automatic expiration;
- a bounded micro-timing harness for the targeting simulator only, one warmup plus one measured trial, capped at 30 seconds total, that records wall-clock numbers without asserting they represent real computer-use or browser-use latency;
- a final `RESULTS.md` separating executed evidence, explicitly skipped experiments (anything that would require a live API key), and product ideas.

Deliverables should include a clear README, fixtures, a runner, and machine-readable results. Never claim a GA capability was exercised live unless a real Claude Platform credential was actually used and detected; default to the offline simulation path and say so plainly. Every local validation command must be bounded to 60 seconds; do not run exhaustive filesystem searches, unbounded loops, or network calls.

Concurrency invariant: agents share one working directory and must never overwrite each other's work. Planning/review tasks may run in parallel with read-only tools. Any task that can mutate the project must run sequentially under the harness's single-writer scheduler, inspect the latest state, preserve previous changes, and leave a concrete handoff for the next agent. Do not create isolated git worktrees.

Source: https://claude.com/blog/computer-use-skills-api-files-api
