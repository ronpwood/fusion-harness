# Computer Use / Skills API / Files API Fusion Harness Validation Prompts

All paid/live-agent validation prompts for the fusion-harness multi-model work come from this directory. Run them in numeric order, simple to complex. Do not invent inline agent prompts in the smoke or Herdr workflows; load the corresponding file verbatim.

Source announcement: https://claude.com/blog/computer-use-skills-api-files-api

| Order | Prompt | Complexity | Intended command | Primary harness behavior |
|---:|---|---|---|---|
| 1 | `01-simple-opinion.md` | Simple | `/fh-opinion` | N-way read-only fan-out and responsive comparison |
| 2 | `02-simple-only-browser-use.md` | Simple | `/fh-only` armed mode | One-shot slot routing and auto-disarm |
| 3 | `03-medium-debate-automation.md` | Medium | `/fh-debate --rounds 2` | Existing pairwise read-only debate regression |
| 4 | `04-medium-fusion-skills-files-lab.md` | Medium | `/fh-fusion` | N read-only workers; temporary FUSION is sole CWD writer |
| 5 | `05-medium-fusion-adoption-memo.md` | Medium | `/fh-fusion` | Full fused-result synchronization and exact ACK fan-out |
| 6 | `06-complex-collaborate-agent-ops-eval.md` | Complex | `/fh-collaborate --rounds 1` | N-agent planning plus scheduler-enforced single writer |
| 7 | `07-complex-auto-validate-migration-kit.md` | Complex | `/fh-auto-validate` | Architect/Main gate-first regression |
| 8 | `08-complex-five-slot-product-blueprint.md` | Complex | Five-slot `/fh-fusion` | Maximum stack, N-source attribution, sole-writer delivery |

The suite spans the announcement's GA computer use tool (multi-action turns, HIPAA-BAA eligibility), the new browser use tool (structure-aware targeting), the Skills API (versioned, sandboxed skill folders), and the Files API (upload-once/reference-by-ID, automatic expiration, higher rate limits and storage).

Unlike the DuckDB v2.0 preview suite, this announcement is short and gives no code samples or published benchmarks beyond two customer quotes (Asteroid, Box). Prompts here lean on the linked platform docs for anything mechanical and are written to require agents to label unstated details as inference rather than fabricate specifics the article doesn't give. Labs and kits (04, 06, 07) are designed to run entirely offline against local mocks/simulations, since no live Claude Platform credential is assumed.
