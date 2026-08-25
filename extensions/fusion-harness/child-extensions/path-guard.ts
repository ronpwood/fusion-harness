/**
 * path-guard.ts — a `pi` extension the harness loads explicitly into its READONLY_TOOLS
 * children via `-e`, denying `read`/`grep`/`find`/`ls` calls against a fixed deny-list
 * BEFORE they execute.
 *
 * Runs inside the spawned CHILD process, not the harness's own — deliberately imports
 * nothing from `extensions/fusion-harness/modules/`; pulling in harness internals here
 * would be a cross-process bug, not this codebase's usual module boundary. The deny-list
 * and path matching live in `./path-guard-rules.ts` (pure, no pi imports, unit-testable
 * standalone); this file is only the `pi` wiring. See
 * specs/harden-readonly-children-secret-exfiltration.md (Phase 4) for the full rationale.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { findDenyMatch } from "./path-guard-rules.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		const candidates: string[] = [];
		if (isToolCallEventType("read", event)) candidates.push(event.input.path);
		else if (isToolCallEventType("grep", event)) {
			if (event.input.path) candidates.push(event.input.path);
			if (event.input.glob) candidates.push(event.input.glob);
		} else if (isToolCallEventType("find", event)) {
			if (event.input.path) candidates.push(event.input.path);
		} else if (isToolCallEventType("ls", event)) {
			if (event.input.path) candidates.push(event.input.path);
		} else {
			return;
		}

		for (const candidate of candidates) {
			const match = findDenyMatch(candidate, ctx.cwd);
			if (match) {
				return {
					block: true,
					reason: `Blocked: "${candidate}" matches a zero-access pattern (${match}). This path may contain credentials and cannot be read by a read-only agent.`,
				};
			}
		}
	});
}
