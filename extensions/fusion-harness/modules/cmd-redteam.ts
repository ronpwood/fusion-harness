/**
 * cmd-redteam.ts — /fh-redteam: N read-only agents, N fixed lenses, one target.
 *
 * Every configured slot inspects the SAME target — an explicit description, or by
 * default the current uncommitted diff — through one fixed lens (correctness,
 * security, performance, maintainability, test-coverage). No judge, no merge: each
 * lens reports its own findings, ranked most-severe first. Strictly read-only:
 * every child runs with READONLY_TOOLS, so the diff is captured by the harness
 * itself (git has no read-only "tool" a child could call).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runChild } from "./child-runner.ts";
import { orderedSlots } from "./model-stack.ts";
import { assignRedteamLenses, redteamPrompt, type RedteamLens } from "./prompt-library.ts";
import { CUSTOM_TYPE, READONLY_TOOLS, runError, runOk, toStat, type HarnessDeps } from "./runtime.ts";

const TARGET_MAX_CHARS = 200_000; // guard against handing a multi-megabyte payload to every lens
const GIT_MAX_BUFFER = 32 * 1024 * 1024; // above this, execFileSync throws before truncation can run

/** Cap `text` at `max` UTF-16 code units without splitting a trailing surrogate pair. */
function truncateSafe(text: string, max: number): { text: string; truncated: boolean } {
	if (text.length <= max) return { text, truncated: false };
	let end = max;
	if (end > 0 && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end -= 1; // lone high surrogate
	return { text: text.slice(0, end), truncated: true };
}

/** `git diff HEAD` (staged + unstaged, relative to the last commit) in `cwd`, or an error string. */
export function captureUncommittedDiff(cwd: string): { diff: string; error?: string } {
	try {
		// stdio explicit (not the default): git dumps a full usage page to stderr when cwd isn't a
		// repo, and that must never leak into the live terminal — only ever surface via error.stderr.
		const diff = execFileSync("git", ["diff", "HEAD"], { cwd, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] });
		return { diff };
	} catch (error) {
		// Exceeding maxBuffer still leaves the buffered output on error.stdout — use it rather
		// than fail outright; the TARGET_MAX_CHARS cap below shrinks it to size either way.
		const stdout = (error as { stdout?: Buffer | string })?.stdout;
		if (stdout) return { diff: stdout.toString() };
		const stderr = (error as { stderr?: Buffer | string })?.stderr;
		const detail = stderr ? stderr.toString().trim().split("\n").pop() : undefined;
		return { diff: "", error: detail || (error instanceof Error ? error.message : String(error)) };
	}
}

function capTarget(label: string, text: string): { label: string; target: string } {
	const { text: capped, truncated } = truncateSafe(text, TARGET_MAX_CHARS);
	if (!truncated) return { label, target: capped };
	return { label: `${label}, truncated`, target: `${capped}\n… [truncated — ${text.length - capped.length} chars elided]` };
}

/** Resolve what every lens reviews: an explicit description, or the current uncommitted diff. */
export function resolveRedteamTarget(raw: string, cwd: string): { label: string; target: string } | { usageError: string } {
	if (raw) return capTarget("TARGET", raw);
	const { diff, error } = captureUncommittedDiff(cwd);
	if (error) return { usageError: `/fh-redteam: no target given and \`git diff HEAD\` failed (${error.trim().split("\n")[0]}). Usage: /fh-redteam [target]` };
	if (!diff.trim()) return { usageError: "/fh-redteam: no target given and the working tree has no uncommitted changes (git diff HEAD is empty). Usage: /fh-redteam [target]" };
	return capTarget("UNCOMMITTED DIFF (git diff HEAD)", diff);
}

export function registerRedteamCommand(pi: ExtensionAPI, h: HarnessDeps): void {
	pi.registerCommand("fh-redteam", {
		description: "Every configured agent inspects the same target read-only through a distinct fixed lens (correctness/security/performance/…). Defaults to the current uncommitted diff. No judge, no merge.",
		handler: async (raw, ctx) => {
			h.noteHost(ctx);
			const input = (raw ?? "").trim();
			const resolved = resolveRedteamTarget(input, ctx.cwd);
			if ("usageError" in resolved) {
				ctx.ui.notify(resolved.usageError, "warning");
				return;
			}
			const { label: targetLabel, target } = resolved;
			const stack = h.modelStack();
			const assignments = assignRedteamLenses(orderedSlots(stack));
			const runs = assignments.map(({ slot }) => h.newSlotRun(slot));
			const lensBySlotId = new Map<string, RedteamLens>(assignments.map(({ slot, lens }) => [slot.id, lens]));
			const startedAt = Date.now();
			const artifactsDir = await h.mkArtifacts();
			await h.save(artifactsDir, "target.md", `${targetLabel}\n\n${target}`);
			await h.save(artifactsDir, "stack.json", JSON.stringify(stack, null, 2));
			h.panel({ kind: "prompt", command: "fh-redteam", ok: true }, `/fh-redteam ${input || "(uncommitted diff)"}`);
			const stopper = h.startStoppable(ctx, "fh-redteam");
			const stopWidget = h.startGridWidget(ctx, "fh-redteam", runs, undefined, startedAt);
			ctx.ui.setStatus(CUSTOM_TYPE, `redteam: ${runs.length} agents reviewing read-only, one lens each…`);
			try {
				await Promise.all(runs.map(async (run) => {
					const slot = run.slot!;
					const lens = lensBySlotId.get(slot.id)!;
					const agentDir = path.join(artifactsDir, "agents", slot.id);
					await fs.promises.mkdir(agentDir, { recursive: true });
					await runChild({ run, prompt: redteamPrompt(slot, stack, lens, targetLabel, target), systemPrompt: slot.systemPrompt, appendSystemPrompts: slot.appendSystemPrompts, tools: READONLY_TOOLS, thinking: slot.thinking, ...h.slotInitialSpawn(slot, ctx, agentDir), cwd: ctx.cwd, timeoutMs: h.childTimeoutMs(), signal: stopper.signal });
					await h.save(agentDir, "lens.txt", lens.key);
					await h.save(agentDir, "answer.md", runOk(run) ? run.text : `FAILED: ${runError(run)}`);
				}));
				if (stopper.stopped()) {
					h.stoppedPanel("fh-redteam", runs, artifactsDir, startedAt, "All active reviewers were stopped; completed findings remain on disk.");
					return;
				}
				const ok = runs.every(runOk);
				const labeled = (run: (typeof runs)[number]) => `**LENS: ${lensBySlotId.get(run.slot!.id)!.label}**\n\n${runOk(run) ? run.text : `FAILED: ${runError(run)}`}`;
				h.panel({ kind: "multi", command: "fh-redteam", title: `⚔ RED TEAM — ${runs.length} LENSES`, ok, prompt: `${targetLabel}: ${target.replace(/\s+/g, " ").slice(0, 100)}`, sources: runs.map(toStat), answers: runs.map((run) => ({ role: run.role, model: run.model, text: labeled(run), slotId: run.slot!.id, slotName: run.slot!.name, color: run.slot!.color, primary: run.slot!.primary })), artifactsDir, ...h.totals(runs, startedAt) }, runs.map((run) => `## ${run.slot!.name} · ${run.model} · ${lensBySlotId.get(run.slot!.id)!.label}\n${runOk(run) ? run.text : `FAILED: ${runError(run)}`}`).join("\n\n"));
				await h.save(artifactsDir, "summary.json", JSON.stringify({ command: "fh-redteam", ok, target: targetLabel, agents: runs.map((run) => ({ ...toStat(run), lens: lensBySlotId.get(run.slot!.id)!.key })), sessions: Object.fromEntries(assignments.map(({ slot }) => [slot.id, runs.find((run) => run.slot?.id === slot.id)?.sessionRef ?? h.cachedSlotId(slot)])), ...h.totals(runs, startedAt) }, null, 2));
			} finally {
				await h.ensureSummary(artifactsDir, { command: "fh-redteam", ok: false, stopped: stopper.stopped(), agents: runs.map(toStat), sessions: Object.fromEntries(assignments.map(({ slot }) => [slot.id, runs.find((run) => run.slot?.id === slot.id)?.sessionRef ?? h.cachedSlotId(slot)])), ...h.totals(runs, startedAt) });
				stopper.release();
				stopWidget();
				ctx.ui.setStatus(CUSTOM_TYPE, undefined);
			}
		},
	});
}
