Build a beta-to-GA migration-readiness kit in `agent_ga_migration_kit/` for teams that integrated computer use before this GA announcement.

The kit must contain:

- `README.md` with scope assumptions and a non-destructive workflow;
- `inventory.py`, an Astral `uv` single-file script that inspects a supplied directory of source files and reports constructs most likely to need GA review: beta-flagged tool/version strings for the computer-use tool, single-action-per-turn tool-use loops that could benefit from multi-action turns, inline "do this every time" instructions duplicated across prompts that are candidates for extraction into a versioned skill, and file-handling code that re-sends full file bytes on every call instead of an upload-once/reference-by-ID pattern;
- `fixtures/` with representative safe sample source files covering each flagged pattern plus at least one clean file that should raise no flags;
- `EXPECTED.md` explaining findings and distinguishing constructs the announcement explicitly changed (beta flags, multi-action turns, automatic file expiration) from cautious modernization suggestions (skill extraction, Files API adoption) that are opinions, not breaking changes;
- automated tests runnable without network access or a live Claude Platform credential.

If a live Claude Platform credential is available in the environment, add an optional capability probe that confirms the computer-use, browser-use, Skills, and Files APIs are reachable and reports their current GA status. If no credential is available, the core inventory tests must still run and the probe must report `SKIP`, never a fabricated pass.

The acceptance gate must be designed before implementation and objectively verify every requested file, behavior, test, and honest credential-probe status.

Source: https://claude.com/blog/computer-use-skills-api-files-api
