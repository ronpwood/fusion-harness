#!/usr/bin/env node
// Reads .fh-history/runs.jsonl — the append-only archive every fusion-harness command
// writes to (see save()/ensureSummary() in fusion-harness.ts) — and prints a run report.
// Run via `just fh-history` (see justfile).

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const HISTORY_DIR = path.join(process.cwd(), ".fh-history");
const HISTORY_FILE = path.join(HISTORY_DIR, "runs.jsonl");

function parseArgs(argv) {
	const args = { limit: 20, all: false, command: undefined, verbose: false, pruneOlderThanDays: undefined };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--all") args.all = true;
		else if (a === "--limit") args.limit = Number(argv[++i]);
		else if (a === "--command") args.command = argv[++i];
		else if (a === "--verbose" || a === "-v") args.verbose = true;
		else if (a === "--prune-older-than") args.pruneOlderThanDays = Number(argv[++i]);
		else if (a === "--help" || a === "-h") {
			console.log(
				"Usage: fh-history [--all] [--limit N] [--command <name>] [--verbose] [--prune-older-than DAYS]\n\n" +
					"  --all                    show every run, not just the last N\n" +
					"  --limit N                how many runs to show (default 20)\n" +
					"  --command <name>         filter to one command (e.g. fh-opinion)\n" +
					"  --verbose                also print a per-agent table: model, tokens in/out, tps, tool calls\n" +
					"  --prune-older-than DAYS  delete archived run artifact folders older than DAYS (keeps runs.jsonl)",
			);
			process.exit(0);
		}
	}
	return args;
}

// Full-run artifacts (prompt + answers) are copied into .fh-history/<run-id>/ on every run —
// unbounded over time. runs.jsonl (cost/token metadata) is tiny and kept forever regardless.
function pruneOlderThan(days) {
	const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
	if (!existsSync(HISTORY_DIR)) return 0;
	let removed = 0;
	for (const entry of readdirSync(HISTORY_DIR)) {
		if (entry === "runs.jsonl") continue;
		const full = path.join(HISTORY_DIR, entry);
		let st;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory() && st.mtimeMs < cutoffMs) {
			rmSync(full, { recursive: true, force: true });
			removed += 1;
		}
	}
	return removed;
}

function loadRuns() {
	if (!existsSync(HISTORY_FILE)) return [];
	return readFileSync(HISTORY_FILE, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
}

function fmtCost(n) {
	return `$${(n ?? 0).toFixed(4)}`;
}

function fmtMs(ms) {
	if (ms == null) return "-";
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTime(iso) {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function printTable(header, rows) {
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)));
	const printRow = (cells) => console.log(cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  "));
	printRow(header);
	printRow(widths.map((w) => "-".repeat(w)));
	for (const row of rows) printRow(row);
}

const args = parseArgs(process.argv.slice(2));

if (args.pruneOlderThanDays != null) {
	const removed = pruneOlderThan(args.pruneOlderThanDays);
	console.log(`Pruned ${removed} archived run folder(s) older than ${args.pruneOlderThanDays} day(s) (runs.jsonl metadata kept).`);
	console.log("");
}

let runs = loadRuns();

if (runs.length === 0) {
	console.log(`No fusion-harness run history yet — ${HISTORY_FILE} is empty or missing.`);
	console.log("Run any /fh-* command first; every run archives its summary here automatically.");
	process.exit(0);
}

if (args.command) runs = runs.filter((r) => r.command === args.command);

if (runs.length === 0) {
	console.log(`No runs found for command "${args.command}".`);
	process.exit(0);
}

const totalCost = runs.reduce((s, r) => s + (r.totalCostUsd ?? 0), 0);
const totalMs = runs.reduce((s, r) => s + (r.totalMs ?? 0), 0);
const okCount = runs.filter((r) => r.ok).length;

const shown = args.all ? runs : runs.slice(-args.limit);

const rows = shown.map((r) => [
	fmtTime(r.ts),
	r.command ?? "-",
	r.ok ? "ok" : "FAIL",
	(r.agents ?? []).map((a) => a.slotId ?? a.role).join(","),
	fmtMs(r.totalMs),
	fmtCost(r.totalCostUsd),
]);

printTable(["TIME", "COMMAND", "STATUS", "AGENTS", "DURATION", "COST"], rows);

console.log("");
console.log(
	`${shown.length} of ${runs.length} run(s) shown${args.command ? ` (command=${args.command})` : ""} — ` +
		`${okCount}/${runs.length} ok — total cost ${fmtCost(totalCost)} — total time ${fmtMs(totalMs)}`,
);

// Per-command cost breakdown — cheap and useful once history spans multiple commands.
const byCommand = new Map();
for (const r of runs) {
	const key = r.command ?? "unknown";
	const entry = byCommand.get(key) ?? { count: 0, cost: 0, ms: 0 };
	entry.count += 1;
	entry.cost += r.totalCostUsd ?? 0;
	entry.ms += r.totalMs ?? 0;
	byCommand.set(key, entry);
}
if (byCommand.size > 1) {
	console.log("");
	printTable(
		["COMMAND", "RUNS", "TOTAL COST", "TOTAL TIME"],
		[...byCommand.entries()].map(([cmd, e]) => [cmd, e.count, fmtCost(e.cost), fmtMs(e.ms)]),
	);
}

// Per-agent detail — model, tokens, throughput, tool calls — already in each summary.json
// but hidden by the run-level rollup above; --verbose surfaces it without recapturing anything.
if (args.verbose) {
	const detailRows = [];
	for (const r of shown) {
		for (const a of r.agents ?? []) {
			detailRows.push([
				fmtTime(r.ts),
				r.command ?? "-",
				a.slotId ?? a.role ?? "-",
				a.model ?? "-",
				a.status ?? "-",
				a.tokensIn ?? 0,
				a.tokensOut ?? 0,
				a.tps != null ? a.tps.toFixed(1) : "-",
				a.toolCalls ?? 0,
				fmtCost(a.costUsd),
			]);
		}
	}
	console.log("");
	printTable(["TIME", "COMMAND", "SLOT", "MODEL", "STATUS", "TOK IN", "TOK OUT", "TPS", "TOOLS", "COST"], detailRows);
}
