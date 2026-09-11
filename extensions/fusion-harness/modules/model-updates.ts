// Pure model-catalog logic for `just models` (scripts/fh-models.js): parse model IDs into
// family + version, find newer same-family models, diff catalog snapshots, and splice a new
// model into stack YAML. No I/O here — the script does the fetching, file access and printing.
// Catalog and snapshot objects come from parsed JSON, so every id lookup is Object.hasOwn —
// a plain `obj[id]` would accept `constructor` / `toString` as catalog entries.

import { isMap, isScalar, isSeq, parseDocument, Scalar } from "yaml";

export interface ModelCostRates {
	input: number;
	output: number;
	cacheRead?: number;
}

/** One entry from pi's model catalog (https://pi.dev/api/models/providers/<provider>). */
export interface CatalogModel {
	id: string;
	name?: string;
	cost?: ModelCostRates;
	contextWindow?: number;
	maxTokens?: number;
}

/** provider → model id → entry. */
export type Catalog = Record<string, Record<string, CatalogModel>>;

export interface ParsedModelId {
	/** provider + namespace + tokens with version placeholders, e.g. `fireworks/accounts/fireworks/models/deepseek-{v}-flash`. */
	familyKey: string;
	/** Main version group, e.g. [4, 1] for `v4p1` / `v4.1` / `4-1`. Empty when the id has none. */
	version: number[];
	/** Release date as digits (MMDD, YYYYMMDD, or YYYYMM from `MM-YYYY`), when present. */
	date?: string;
}

export interface Upgrade {
	model: string; // provider/id
	name?: string;
	cost?: ModelCostRates;
	contextWindow?: number;
	costDelta?: { input: number; output: number };
	contextDelta?: number;
}

export interface ProviderDiff {
	added: string[];
	removed: string[];
	/** `from: null` = a price appeared; `to: null` = a price was dropped. */
	priceChanged: Array<{ id: string; from: ModelCostRates | null; to: ModelCostRates | null }>;
}

/** Snapshot shape persisted between checks: provider → id → cost (or null when uncosted). */
export type CatalogSnapshot = Record<string, Record<string, ModelCostRates | null>>;

const VERSION_TOKEN_RE = /^([a-z]*)(\d+(?:\.\d+)*)$/;

/** Same shape rule as model-stack.ts MODEL_RE: `provider/id`, no whitespace. */
export const MODEL_RE = /^[^/\s]+\/[^\s]+$/;

/** `provider/id` → parts. No slash (or a leading one) → empty provider, so callers can reject it. */
export function splitModel(model: string): { provider: string; id: string } {
	const slash = model.indexOf("/");
	return slash > 0 ? { provider: model.slice(0, slash), id: model.slice(slash + 1) } : { provider: "", id: model };
}

function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
	return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * `deepseek-v4-flash-0731` → family `deepseek-{v}-flash`, version [4], date 0731.
 * Handles Fireworks `p` decimals (`glm-5p3`), Anthropic dash versions (`claude-fable-5-1`),
 * dated snapshots (`-20251001`, `-2024-05-13`, `-04-2026`) and `:variant` suffixes (`:batch`),
 * which stay in the family key so variants never match their base model.
 *
 * Date caveat: the first bare 4-digit token is taken as a date without checking its format,
 * so MMDD (DeepSeek `0731`), YYMM (Mistral `2512`) and a bare year all land in `date`. Dates
 * are only compared at equal length within one family, so formats rarely mix, but a same-length
 * mix (`-2025` vs `-0731`) or an MMDD year wrap (`-1231` → next year's `-0101`) misorders.
 * Treat date-only upgrades as candidates to confirm, not facts.
 */
export function parseModelId(model: string): ParsedModelId {
	const { provider, id } = splitModel(model);
	const lastSlash = id.lastIndexOf("/");
	const namespace = lastSlash >= 0 ? id.slice(0, lastSlash + 1) : "";
	let [segment, variant] = id.slice(lastSlash + 1).toLowerCase().split(/:(.*)/s);

	let date: string | undefined;
	segment = segment
		.replace(/(?:^|-)(\d{4})-(\d{2})-(\d{2})(?=-|$)/, (_m, y, mo, d) => ((date = `${y}${mo}${d}`), ""))
		.replace(/(?:^|-)(\d{2})-(20\d{2})(?=-|$)/, (_m, mo, y) => ((date ??= `${y}${mo}`), ""))
		.replace(/(\d)p(\d)/g, "$1.$2");

	const family: string[] = [];
	let version: number[] = [];
	let group: number[] | undefined; // version group being extended by following bare-number tokens
	for (const token of segment.split("-").filter(Boolean)) {
		if (/^\d{4}$|^\d{8}$/.test(token) && !date) {
			date = token;
			group = undefined;
			continue;
		}
		const match = VERSION_TOKEN_RE.exec(token);
		if (match) {
			const numbers = match[2].split(".").map(Number);
			if (group && !match[1]) {
				group.push(...numbers); // `claude-opus-4-5` → [4, 5]
				continue;
			}
			if (!version.length) {
				version = numbers;
				group = version;
				family.push(`{${match[1]}}`);
			} else {
				group = undefined;
				family.push(token); // secondary numeric groups must match literally
			}
			continue;
		}
		group = undefined;
		family.push(token);
	}

	const familyKey = `${provider}/${namespace}${family.join("-")}${variant ? `:${variant}` : ""}`;
	return { familyKey, version, date };
}

function compareVersions(a: number[], b: number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff) return diff;
	}
	return 0;
}

/**
 * Same-family catalog models newer than `slotModel`: a higher version, or the same version
 * with a later date (both dated, same date format). Newest first. Undated aliases of the same
 * version are not upgrades. `released` (provider/id → epoch ms, when known) vetoes version
 * numbers that aren't chronological — OpenRouter's `x-ai/grok-4.20` predates `grok-4.6`.
 */
export function findUpgrades(slotModel: string, catalog: Catalog, released: Record<string, number> = {}): Upgrade[] {
	const { provider, id } = splitModel(slotModel);
	const models = own(catalog, provider) ?? {};
	const current = parseModelId(slotModel);
	if (!current.version.length && !current.date) return [];
	const currentEntry = own(models, id);

	const candidates: Array<{ parsed: ParsedModelId; entry: CatalogModel }> = [];
	for (const entry of Object.values(models)) {
		const parsed = parseModelId(`${provider}/${entry.id}`);
		if (parsed.familyKey !== current.familyKey || !parsed.version.length) continue;
		const versionCmp = compareVersions(parsed.version, current.version);
		const newerDate = versionCmp === 0 && !!parsed.date && !!current.date && parsed.date.length === current.date.length && parsed.date > current.date;
		const releasedEarlier = (own(released, `${provider}/${entry.id}`) ?? Infinity) < (own(released, slotModel) ?? -Infinity);
		if ((versionCmp > 0 || newerDate) && !releasedEarlier) candidates.push({ parsed, entry });
	}

	candidates.sort((a, b) => compareVersions(b.parsed.version, a.parsed.version) || (b.parsed.date ?? "").localeCompare(a.parsed.date ?? ""));
	return candidates.map(({ entry }) => {
		const upgrade: Upgrade = { model: `${provider}/${entry.id}`, name: entry.name, cost: entry.cost, contextWindow: entry.contextWindow };
		if (entry.cost && currentEntry?.cost) {
			upgrade.costDelta = { input: entry.cost.input - currentEntry.cost.input, output: entry.cost.output - currentEntry.cost.output };
		}
		if (entry.contextWindow != null && currentEntry?.contextWindow != null) upgrade.contextDelta = entry.contextWindow - currentEntry.contextWindow;
		return upgrade;
	});
}

export function snapshotOf(catalog: Catalog): CatalogSnapshot {
	const snapshot: CatalogSnapshot = {};
	for (const [provider, models] of Object.entries(catalog)) {
		snapshot[provider] = {};
		for (const [id, entry] of Object.entries(models)) {
			snapshot[provider][id] = entry.cost ? { input: entry.cost.input, output: entry.cost.output, cacheRead: entry.cost.cacheRead } : null;
		}
	}
	return snapshot;
}

function samePrice(a: ModelCostRates | null, b: ModelCostRates | null): boolean {
	if (!a || !b) return a === b;
	return a.input === b.input && a.output === b.output && (a.cacheRead ?? 0) === (b.cacheRead ?? 0);
}

/** Per-provider changes since `prev`. A provider absent from `prev` is a fresh baseline — no diff. */
export function diffSnapshot(prev: CatalogSnapshot, current: CatalogSnapshot): Record<string, ProviderDiff> {
	const diffs: Record<string, ProviderDiff> = {};
	for (const [provider, models] of Object.entries(current)) {
		const before = own(prev, provider);
		if (!before) continue;
		const diff: ProviderDiff = { added: [], removed: [], priceChanged: [] };
		for (const [id, cost] of Object.entries(models)) {
			if (!Object.hasOwn(before, id)) diff.added.push(id);
			else if (!samePrice(before[id], cost)) diff.priceChanged.push({ id, from: before[id], to: cost });
		}
		for (const id of Object.keys(before)) if (!Object.hasOwn(models, id)) diff.removed.push(id);
		if (diff.added.length || diff.removed.length || diff.priceChanged.length) diffs[provider] = diff;
	}
	return diffs;
}

/**
 * The snapshot to persist after a check, or undefined when it must not be written: a partial
 * fetch would record missing providers' models as removed (then as "new" next time). Providers
 * this run didn't fetch (`--stack`) keep their previous entries.
 */
export function nextSnapshot(prev: CatalogSnapshot | undefined, current: CatalogSnapshot, fetchFailed: boolean): CatalogSnapshot | undefined {
	return fetchFailed ? undefined : { ...prev, ...current };
}

/**
 * Replace one slot's `model:` value in stack YAML source, touching only that scalar's bytes so
 * comments, key order and formatting survive. Keeps the scalar's quote style. Throws on a
 * missing slot or unparseable YAML; re-parses the result to prove the splice landed.
 */
export function spliceModel(source: string, slotName: string, model: string): { updated: string; previous: string } {
	const doc = parseDocument(source);
	if (doc.errors.length) throw new Error(`YAML parse failed: ${doc.errors[0].message}`);
	if (!isSeq(doc.contents)) throw new Error("stack YAML must be a list of slots");
	const names = doc.contents.items.map((item) => (isMap(item) ? item.get("name") : undefined));
	const item = doc.contents.items[names.indexOf(slotName)];
	const scalar = isMap(item) ? item.get("model", true) : undefined;
	if (!isScalar(scalar) || !scalar.range || typeof scalar.value !== "string") {
		throw new Error(`no slot named ${slotName} with a model (slots: ${names.join(", ")})`);
	}
	const text =
		scalar.type === Scalar.QUOTE_DOUBLE ? JSON.stringify(model) : scalar.type === Scalar.QUOTE_SINGLE ? `'${model.replaceAll("'", "''")}'` : model;
	const updated = source.slice(0, scalar.range[0]) + text + source.slice(scalar.range[1]);

	const check = parseDocument(updated);
	const landed = isSeq(check.contents) ? check.contents.items.find((node) => isMap(node) && node.get("name") === slotName) : undefined;
	if (check.errors.length || !isMap(landed) || landed.get("model") !== model) throw new Error("splice produced unexpected YAML — file left untouched");
	return { updated, previous: scalar.value };
}
