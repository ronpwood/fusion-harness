Design and build a compact offline lab in `agent_platform_lab/` that teaches the announced anatomy of two GA capabilities without requiring any live API key:

- a real example skill folder matching the announced shape — instructions, one script, one template — for the article's claims-agent example (a skill that "encodes the team's filing procedure");
- a local mock of Files API semantics: upload once, reference the document by an opaque ID in later calls instead of re-sending it, download a file the "agent" creates, and simulate automatic file expiration;
- a small end-to-end run of the article's example loop — read an intake document by ID, apply the skill's instructions, produce and save a confirmation file — entirely against the local mock.

Required canonical deliverables:

- `agent_platform_lab/README.md` — what is real (the skill-folder shape, the ID-based reference pattern) vs. simulated (there is no live Claude Platform call), run instructions, expected observations, and cleanup;
- `agent_platform_lab/skills/filing-procedure/SKILL.md` plus one script and one template file, following the announcement's description of a skill as "a folder of instructions, scripts, and templates";
- `agent_platform_lab/files_api_mock.py` — an Astral `uv` single-file script implementing upload/reference-by-ID/expire/download against local storage (no network calls);
- `agent_platform_lab/run.sh` — runs the end-to-end simulated loop and prints what happened at each step, honestly labeled as a local mock, never implying it exercised the real Files API or Skills API.

Fusion protocol requirement: parallel model workers are researchers/planners only and must not modify the project. The temporary FUSION agent is the sole writer and must synthesize their results, create the canonical files, inspect them, and run the local script. Never claim the real Files API or Skills API was exercised — only the local mock.

Source: https://claude.com/blog/computer-use-skills-api-files-api
