Create a decision-ready GA adoption memo at `AGENT_PLATFORM_GA_ADOPTION_MEMO.md` for a team choosing which of computer use, the browser use tool, the Skills API, and the Files API to pilot first for a support-ticket resolution agent.

The memo must synthesize:

1. the product opportunities from multi-action turns, HIPAA-BAA-eligible computer use, structure-aware browser use, versioned sandboxed skills, and Files API storage/expiration/rate-limit improvements;
2. a migration-risk register for teams currently on beta computer-use integrations: behavior changes from multi-action turns, sandbox execution assumptions for skills, file-expiration defaults that could silently drop long-lived documents, and the fact that Vertex AI parity is still pending;
3. three experiments ranked by learning value, each with a falsifiable success criterion (e.g., "browser use resolves N of M target elements without falling back to coordinates");
4. an "announced fact vs. our inference" table — the article gives one customer's numbers (Asteroid: 32→13 minutes, ~30% cost reduction, 100% completion) and one qualitative case (Box's credit-memo skill); flag anything else as inference, not a release guarantee.

Fusion protocol requirement: all configured workers inspect and propose read-only; only the temporary FUSION agent writes the memo. After fusion, the complete fused memo/result must be sent back into every configured model's context using the no-action synchronization envelope. Each model must reply only `ACK FUSION <run-id>` and must not use tools, critique, revise, or continue the task during acknowledgement.

Source: https://claude.com/blog/computer-use-skills-api-files-api
