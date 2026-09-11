#!/usr/bin/env node
// Pre-launch model check for the YAML stacks in .pi/fusion-harness/ — run via `just models`
// (see justfile). Compares every slot against pi's model catalog (the public pi.dev feed pi
// itself overlays), reports missing models, same-family upgrades, price changes and new
// catalog entries since the last check, and whether local pi can see each slot.
// `set` swaps one slot's model in place — the only sanctioned way to edit a stack file from
// Claude Code, since the guard-secrets hook blocks direct access to .pi/.
// Needs Node >= 22.18: it imports the harness's .ts modules via native type stripping.

import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { loadModelStack, orderedSlots } from "../modules/model-stack.ts";
import { diffSnapshot, findUpgrades, MODEL_RE, nextSnapshot, snapshotOf, spliceModel, splitModel } from "../modules/model-updates.ts";
import { scopedChildEnv } from "../modules/secret-guard.ts";

const execFileAsync = promisify(execFile);

const STACK_DIR = path.join(process.cwd(), ".pi", "fusion-harness");
const STATE_DIR = path.join(process.cwd(), ".fh-models");
const SNAPSHOT_FILE = path.join(STATE_DIR, "catalog.json");
const CATALOG_URL = "https://pi.dev/api/models/providers/";
const PI_PACKAGE = "@earendil-works/pi-coding-agent";
const NEW_MODELS_SHOWN = 15;

const USAGE =
	"Usage: fh-models [--refresh] [--json] [--stack <name>]\n" +
	"       fh-models set <stack> <slot> <provider/id>\n\n" +
	"  --refresh       run `pi update --models` first (refresh pi's local catalog)\n" +
	"  --json          machine-readable report (used by the /model-updates skill)\n" +
	"  --stack <name>  check one stack only (fusion, fusion-5, openrouter, trio)\n" +
	"  set             swap one slot's model; <stack> is the name after `model-stack-` in the\n" +
	"                  filename, e.g. `set fusion-5 hawk fireworks/accounts/fireworks/models/…`";

function fail(message) {
	console.error(message);
	process.exit(1);
}

function parseArgs(argv) {
	const args = { command: "check", refresh: false, json: false, stacks: [], positional: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--refresh") args.refresh = true;
		else if (a === "--json") args.json = true;
		else if (a === "--stack") args.stacks.push(argv[++i]);
		else if (a === "--help" || a === "-h") {
			console.log(USAGE);
			process.exit(0);
		} else if (a.startsWith("-")) fail(`Unknown flag: ${a}\n\n${USAGE}`);
		else args.positional.push(a);
	}
	// The first positional is the subcommand, wherever flags sit (`--json set …` must not silently check).
	if (args.positional[0] === "set") args.command = args.positional.shift();
	else if (args.positional.length) fail(`Unexpected argument: ${args.positional[0]}\n\n${USAGE}`);
	return args;
}

function stackNames() {
	if (!existsSync(STACK_DIR)) return [];
	return readdirSync(STACK_DIR)
		.map((f) => /^model-stack-(.+)\.ya?ml$/.exec(f)?.[1])
		.filter(Boolean)
		.sort();
}

// Only names discovered in STACK_DIR resolve (directory entries can't contain `/`), so a
// crafted `../` name can't reach other files.
function stackFile(name) {
	if (!stackNames().includes(name)) fail(`No such stack: ${name} (known: ${stackNames().join(", ")})`);
	const yaml = path.join(STACK_DIR, `model-stack-${name}.yaml`);
	return existsSync(yaml) ? yaml : path.join(STACK_DIR, `model-stack-${name}.yml`);
}

async function fetchProvider(provider) {
	const res = await fetch(CATALOG_URL + encodeURIComponent(provider), { signal: AbortSignal.timeout(5_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

async function fetchCatalog(providers) {
	const catalog = {};
	const errors = {};
	await Promise.all(
		[...providers].map(async (provider) => {
			try {
				catalog[provider] = await fetchProvider(provider);
			} catch (error) {
				errors[provider] = error instanceof Error ? error.message : String(error);
			}
		}),
	);
	return { catalog, errors };
}

// pi's catalog has no release dates; OpenRouter's public one does. Used only to veto
// version numbers that aren't chronological (grok-4.20 predates grok-4.6). Best-effort.
async function openrouterReleaseDates() {
	try {
		const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(5_000) });
		const { data } = await res.json();
		return Object.fromEntries(data.filter((m) => m.created).map((m) => [`openrouter/${m.id}`, m.created * 1000]));
	} catch {
		return {};
	}
}

// What a clean-room child for each provider can see: `pi --no-extensions --list-models` under
// the same scopedChildEnv() the harness gives children (base allowlist + that provider's key
// only, offline). Parsing matches childVisibleModels() in fusion-harness.ts.
// provider → Set of visible provider/id, or undefined when the listing failed.
async function childVisibleModels(providers) {
	const entries = await Promise.all(
		[...providers].map(async (provider) => {
			try {
				const { stdout } = await execFileAsync("pi", ["--no-extensions", "--list-models"], {
					timeout: 30_000,
					env: scopedChildEnv(`${provider}/-`),
				});
				const models = new Set();
				for (const line of stdout.split("\n").slice(1)) {
					const [p, model] = line.trim().split(/\s+/);
					if (p && model) models.add(`${p}/${model}`);
				}
				return [provider, models];
			} catch {
				return [provider, undefined];
			}
		}),
	);
	return new Map(entries);
}

async function piVersions() {
	const run = async (cmd, argv) => {
		try {
			return (await execFileAsync(cmd, argv, { timeout: 10_000 })).stdout.trim() || null;
		} catch {
			return null;
		}
	};
	const [installed, latest] = await Promise.all([run("pi", ["--version"]), run("npm", ["view", PI_PACKAGE, "version"])]);
	return { installed, latest };
}

function loadSnapshot() {
	try {
		return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
	} catch {
		return undefined;
	}
}

function fmtCost(cost) {
	return cost ? `$${cost.input}/$${cost.output}` : "-";
}

function fmtCostDelta(delta) {
	if (!delta || (!delta.input && !delta.output)) return "same price";
	const fmt = (n) => {
		const rounded = Math.round(n * 1000) / 1000;
		return rounded > 0 ? `+${rounded}` : String(rounded);
	};
	return `${fmt(delta.input)}/${fmt(delta.output)}`;
}

function fmtCtx(n) {
	if (n == null) return "-";
	return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;
}

function printTable(header, rows) {
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)));
	const printRow = (cells) => console.log(cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ").trimEnd());
	printRow(header);
	printRow(widths.map((w) => "-".repeat(w)));
	for (const row of rows) printRow(row);
}

async function check(args) {
	if (args.refresh) {
		const refresh = spawnSync("pi", ["update", "--models"], { stdio: args.json ? "ignore" : "inherit", timeout: 60_000 });
		if (refresh.status !== 0) console.error("warning: `pi update --models` failed — local catalog may be stale");
	}

	const names = args.stacks.length ? args.stacks : stackNames();
	if (!names.length) fail(`No model stacks found in ${STACK_DIR}`);

	const stacks = names.map((name) => {
		const file = stackFile(name);
		try {
			return { stack: name, loaded: loadModelStack(file) };
		} catch (error) {
			return { stack: name, error: error instanceof Error ? error.message : String(error) };
		}
	});
	const providers = new Set(stacks.flatMap((s) => (s.loaded ? s.loaded.slots.map((slot) => splitModel(slot.model).provider) : [])));
	const [{ catalog, errors: fetchErrors }, released, visible, pi] = await Promise.all([
		fetchCatalog(providers),
		providers.has("openrouter") ? openrouterReleaseDates() : {},
		childVisibleModels(providers),
		piVersions(),
	]);
	const prev = loadSnapshot();
	const current = snapshotOf(catalog);
	const diffs = prev ? diffSnapshot(prev.providers ?? {}, current) : {};
	const listFailures = [...visible].filter(([, models]) => !models).map(([provider]) => provider);

	let missing = 0;
	const report = {
		checkedAt: new Date().toISOString(),
		previousCheckAt: prev?.checkedAt ?? null,
		pi,
		fetchErrors,
		localListFailures: listFailures,
		stacks: stacks.map(({ stack, loaded, error }) => {
			if (!loaded) return { stack, error, slots: [] };
			return {
				stack,
				slots: orderedSlots(loaded).map((slot) => {
					const { provider, id } = splitModel(slot.model);
					const fetched = Object.hasOwn(catalog, provider);
					const entry = fetched && Object.hasOwn(catalog[provider], id) ? catalog[provider][id] : undefined;
					const status = !fetched ? "unknown" : entry ? "ok" : "missing";
					if (status === "missing") missing++;
					const childModels = visible.get(provider);
					return {
						name: slot.name,
						role: slot.architect ? "architect" : slot.primary ? "main" : "builder",
						model: slot.model,
						status,
						localVisible: childModels ? childModels.has(slot.model) : null,
						cost: entry?.cost ?? null,
						contextWindow: entry?.contextWindow ?? null,
						priceChange: diffs[provider]?.priceChanged.find((c) => c.id === id) ?? null,
						upgrades: fetched ? findUpgrades(slot.model, catalog, released) : [],
					};
				}),
			};
		}),
		catalogChanges: diffs,
	};

	const snapshot = nextSnapshot(prev?.providers, current, Object.keys(fetchErrors).length > 0);
	if (snapshot) {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(SNAPSHOT_FILE, `${JSON.stringify({ checkedAt: report.checkedAt, providers: snapshot }, null, 2)}\n`);
	}

	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printReport(report);
	if (missing || Object.keys(fetchErrors).length || stacks.some((s) => s.error)) process.exitCode = 1;
}

function printReport(report) {
	const { installed, latest } = report.pi;
	if (installed && latest && installed !== latest) console.log(`pi ${installed} → ${latest} available (run: pi update)`);
	else if (installed) console.log(`pi ${installed}${latest ? " (latest)" : ""}`);
	for (const [provider, message] of Object.entries(report.fetchErrors)) console.log(`catalog fetch failed for ${provider}: ${message}`);
	if (report.localListFailures.length) console.log(`warning: \`pi --list-models\` failed for ${report.localListFailures.join(", ")} — child visibility not checked`);

	for (const { stack, error, slots } of report.stacks) {
		console.log("");
		console.log(`■ ${stack}`);
		if (error) {
			console.log(error);
			continue;
		}
		printTable(
			["SLOT", "ROLE", "MODEL", "$IN/$OUT per M", "CTX", "STATUS"],
			slots.map((s) => {
				const notes = [s.status.toUpperCase()];
				if (s.status === "ok" && s.localVisible === false) notes.push("NOT VISIBLE TO CHILDREN (key in .env? pi update --models)");
				if (s.priceChange) notes.push(`PRICE ${fmtCost(s.priceChange.from)} → ${fmtCost(s.priceChange.to)}`);
				if (s.upgrades.length) notes.push(`UPGRADE ×${s.upgrades.length}`);
				return [s.name, s.role, s.model, fmtCost(s.cost), fmtCtx(s.contextWindow), notes.join(" · ")];
			}),
		);
		for (const s of slots) {
			for (const u of s.upgrades) {
				console.log(`  ↑ ${s.name}: ${u.model}  ${fmtCost(u.cost)} (${fmtCostDelta(u.costDelta)})  ${fmtCtx(u.contextWindow)} ctx`);
			}
		}
	}

	const changes = Object.entries(report.catalogChanges);
	console.log("");
	if (Object.keys(report.fetchErrors).length) console.log("Catalog fetch incomplete — snapshot not updated.");
	else if (!report.previousCheckAt) console.log("First check — catalog snapshot saved; new models are reported from the next run.");
	else if (!changes.length) console.log(`No catalog changes since ${new Date(report.previousCheckAt).toLocaleString()}.`);
	for (const [provider, diff] of changes) {
		const shown = diff.added.slice(0, NEW_MODELS_SHOWN);
		if (diff.added.length) {
			console.log(`new in ${provider}: ${shown.join(", ")}${diff.added.length > shown.length ? ` … +${diff.added.length - shown.length} more (--json)` : ""}`);
		}
		if (diff.removed.length) console.log(`removed from ${provider}: ${diff.removed.join(", ")}`);
	}
}

async function set(args) {
	const [stack, slotName, model, extra] = args.positional;
	if (!stack || !slotName || !model || extra) fail(USAGE);
	const file = stackFile(stack);
	if (!MODEL_RE.test(model)) fail(`Model must be provider/id, e.g. anthropic/claude-fable-5-1; got ${JSON.stringify(model)}`);
	const { provider, id } = splitModel(model);
	let models;
	try {
		models = await fetchProvider(provider);
	} catch (error) {
		fail(`Could not fetch the ${provider} catalog: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Object.hasOwn(models, id)) fail(`${model} is not in pi's ${provider} catalog — refusing to write a model pi can't run.`);

	let splice;
	try {
		splice = spliceModel(readFileSync(file, "utf8"), slotName, model);
	} catch (error) {
		fail(`${stack}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (splice.previous === model) {
		console.log(`${stack}/${slotName} already uses ${model}`);
		return;
	}

	// Validate next to the original — system-prompt paths resolve relative to the YAML.
	const temp = path.join(path.dirname(file), `.fh-models-tmp-${stack}.yaml`);
	writeFileSync(temp, splice.updated);
	try {
		loadModelStack(temp);
	} catch (error) {
		rmSync(temp, { force: true });
		fail(error instanceof Error ? error.message : String(error));
	}
	renameSync(temp, file);
	console.log(`${stack}/${slotName}: ${splice.previous} → ${model}`);
}

const args = parseArgs(process.argv.slice(2));
await (args.command === "set" ? set(args) : check(args));
