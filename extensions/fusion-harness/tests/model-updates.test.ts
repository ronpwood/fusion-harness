import { describe, expect, test } from "bun:test";
import { type Catalog, diffSnapshot, findUpgrades, nextSnapshot, parseModelId, snapshotOf, spliceModel, splitModel } from "../modules/model-updates.ts";

const FW = "accounts/fireworks/models/";
const entry = (id: string, input = 1, output = 2, contextWindow = 100_000) => ({ id, cost: { input, output, cacheRead: 0.1 }, contextWindow });
function catalog(provider: string, ids: string[]): Catalog {
  return { [provider]: Object.fromEntries(ids.map((id) => [id, entry(id)])) };
}
const upgradesOf = (model: string, cat: Catalog) => findUpgrades(model, cat).map((u) => u.model);

describe("parseModelId", () => {
  test("Fireworks p-decimals, v-prefix and MMDD dates", () => {
    expect(parseModelId(`fireworks/${FW}deepseek-v4-flash-0731`)).toEqual({ familyKey: `fireworks/${FW}deepseek-{v}-flash`, version: [4], date: "0731" });
    expect(parseModelId(`fireworks/${FW}deepseek-v4p1-flash`)).toEqual({ familyKey: `fireworks/${FW}deepseek-{v}-flash`, version: [4, 1], date: undefined });
    expect(parseModelId(`fireworks/${FW}glm-5p3`).version).toEqual([5, 3]);
  });

  test("Anthropic dash versions and YYYYMMDD snapshots", () => {
    expect(parseModelId("anthropic/claude-fable-5-1")).toMatchObject({ familyKey: "anthropic/claude-fable-{}", version: [5, 1] });
    expect(parseModelId("anthropic/claude-haiku-4-5-20251001")).toMatchObject({ familyKey: "anthropic/claude-haiku-{}", version: [4, 5], date: "20251001" });
  });

  test("dashed dates and :variants", () => {
    expect(parseModelId("openai/gpt-4o-2024-05-13")).toMatchObject({ date: "20240513" });
    expect(parseModelId("google/deep-research-preview-04-2026")).toMatchObject({ date: "202604" });
    expect(parseModelId("openrouter/z-ai/glm-5.3:batch").familyKey).toBe("openrouter/z-ai/glm-{}:batch");
  });
});

describe("findUpgrades", () => {
  test("dated v4 → v4.1 on Fireworks, newest first, with deltas", () => {
    const cat: Catalog = { fireworks: {
      [`${FW}deepseek-v4-flash-0731`]: entry(`${FW}deepseek-v4-flash-0731`, 0.22, 0.66, 1_000_000),
      [`${FW}deepseek-v4p1-flash`]: entry(`${FW}deepseek-v4p1-flash`, 0.3, 0.9, 1_000_000),
      [`${FW}deepseek-v4-flash-vision-exp`]: entry(`${FW}deepseek-v4-flash-vision-exp`),
      [`${FW}deepseek-v4-pro-0813`]: entry(`${FW}deepseek-v4-pro-0813`),
    } };
    const [upgrade, ...rest] = findUpgrades(`fireworks/${FW}deepseek-v4-flash-0731`, cat);
    expect(rest).toEqual([]);
    expect(upgrade.model).toBe(`fireworks/${FW}deepseek-v4p1-flash`);
    expect(upgrade.costDelta?.input).toBeCloseTo(0.08);
    expect(upgrade.contextDelta).toBe(0);
  });

  test("letter-prefixed families stay apart: kimi-k3 vs kimi-k2p7-code", () => {
    expect(upgradesOf(`fireworks/${FW}kimi-k2p6`, catalog("fireworks", [`${FW}kimi-k2p6`, `${FW}kimi-k2p7-code`, `${FW}kimi-k3`]))).toEqual([`fireworks/${FW}kimi-k3`]);
    expect(upgradesOf(`fireworks/${FW}kimi-k3`, catalog("fireworks", [`${FW}kimi-k3`, `${FW}kimi-k2p7-code`]))).toEqual([]);
  });

  test("-lite, -preview and :batch are separate families", () => {
    const cat = catalog("google", ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.9-flash-lite", "gemini-4-flash-preview", "gemini-flash-latest"]);
    expect(upgradesOf("google/gemini-3.7-flash", cat)).toEqual(["google/gemini-3.8-flash"]);
    expect(upgradesOf("openrouter/z-ai/glm-5.2", catalog("openrouter", ["z-ai/glm-5.2", "z-ai/glm-5.3", "z-ai/glm-5.3:batch", "~z-ai/glm-latest"]))).toEqual(["openrouter/z-ai/glm-5.3"]);
  });

  test("Fireworks glm-5p2 → glm-5p3 and Anthropic fable-5 → fable-5-1", () => {
    expect(upgradesOf(`fireworks/${FW}glm-5p2`, catalog("fireworks", [`${FW}glm-5p2`, `${FW}glm-5p3`, `${FW}glm-5p3-flash`]))).toEqual([`fireworks/${FW}glm-5p3`]);
    expect(upgradesOf("anthropic/claude-fable-5", catalog("anthropic", ["claude-fable-5", "claude-fable-5-1", "claude-opus-5"]))).toEqual(["anthropic/claude-fable-5-1"]);
  });

  test("release dates veto non-chronological version numbers (grok-4.20 predates grok-4.6)", () => {
    const cat = catalog("openrouter", ["x-ai/grok-4.6", "x-ai/grok-4.20", "x-ai/grok-4.7"]);
    expect(upgradesOf("openrouter/x-ai/grok-4.6", cat)).toEqual(["openrouter/x-ai/grok-4.20", "openrouter/x-ai/grok-4.7"]);
    const released = { "openrouter/x-ai/grok-4.20": Date.parse("2026-03-31"), "openrouter/x-ai/grok-4.6": Date.parse("2026-08-12") };
    expect(findUpgrades("openrouter/x-ai/grok-4.6", cat, released).map((u) => u.model)).toEqual(["openrouter/x-ai/grok-4.7"]);
  });

  test("no version and no date → no candidates; mixed date formats are never compared", () => {
    expect(upgradesOf(`fireworks/${FW}inkling`, catalog("fireworks", [`${FW}inkling`, `${FW}inkling-2`]))).toEqual([]);
    expect(upgradesOf("anthropic/claude-haiku-4-5-0901", catalog("anthropic", ["claude-haiku-4-5-0901", "claude-haiku-4-5-20251001"]))).toEqual([]);
  });

  test("Object.prototype names are not catalog entries", () => {
    expect(findUpgrades("anthropic/constructor", catalog("anthropic", ["claude-fable-5"]))).toEqual([]);
    expect(findUpgrades("constructor/x-1", catalog("anthropic", ["x-2"]))).toEqual([]);
    expect(splitModel("gemini")).toEqual({ provider: "", id: "gemini" });
  });

  test("same version: later date is an upgrade, undated alias is not", () => {
    expect(upgradesOf("anthropic/claude-haiku-4-5-20250901", catalog("anthropic", ["claude-haiku-4-5", "claude-haiku-4-5-20251001"]))).toEqual(["anthropic/claude-haiku-4-5-20251001"]);
    expect(upgradesOf("openrouter/deepseek/deepseek-v4-flash-0731", catalog("openrouter", ["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash-0731"]))).toEqual([]);
  });
});

describe("diffSnapshot", () => {
  test("added, removed and price-changed per provider; new providers are a baseline", () => {
    const prev = snapshotOf(catalog("fireworks", [`${FW}a`, `${FW}b`]));
    const next = snapshotOf({ ...catalog("fireworks", [`${FW}a`, `${FW}c`]), ...catalog("google", ["gemini-3.8-flash"]) });
    next.fireworks[`${FW}a`] = { input: 5, output: 2, cacheRead: 0.1 };
    expect(diffSnapshot(prev, next)).toEqual({
      fireworks: {
        added: [`${FW}c`],
        removed: [`${FW}b`],
        priceChanged: [{ id: `${FW}a`, from: { input: 1, output: 2, cacheRead: 0.1 }, to: { input: 5, output: 2, cacheRead: 0.1 } }],
      },
    });
    expect(diffSnapshot(next, next)).toEqual({});
  });

  test("a price appearing or disappearing is a change; prototype-named ids are ordinary ids", () => {
    const prev = { fireworks: { a: null, b: { input: 1, output: 2 }, toString: null } };
    const next = { fireworks: { a: { input: 1, output: 2 }, b: null, constructor: null } };
    expect(diffSnapshot(prev, next)).toEqual({
      fireworks: {
        added: ["constructor"],
        removed: ["toString"],
        priceChanged: [{ id: "a", from: null, to: { input: 1, output: 2 } }, { id: "b", from: { input: 1, output: 2 }, to: null }],
      },
    });
  });
});

describe("nextSnapshot", () => {
  test("keeps providers this run didn't fetch; writes nothing after a failed fetch", () => {
    const prev = { openai: { "gpt-5.6-sol": null }, google: { old: null } };
    const current = { google: { "gemini-3.8-flash": null } };
    expect(nextSnapshot(prev, current, false)).toEqual({ openai: { "gpt-5.6-sol": null }, google: { "gemini-3.8-flash": null } });
    expect(nextSnapshot(undefined, current, false)).toEqual(current);
    expect(nextSnapshot(prev, current, true)).toBeUndefined();
  });
});

describe("spliceModel", () => {
  const stack = `# fusion-5 — comments and spacing must survive
- name: rune
  model: anthropic/claude-fable-5   # architect
  architect: true

- name: flux
  model: "google/gemini-3.7-flash"
  primary: true
- name: hawk
  model: 'fireworks/accounts/fireworks/models/deepseek-v4-flash-0731'
`;

  test("changes only the target scalar's bytes, keeping comments and quote style", () => {
    const plain = spliceModel(stack, "rune", "anthropic/claude-fable-5-1");
    expect(plain.previous).toBe("anthropic/claude-fable-5");
    expect(plain.updated).toBe(stack.replace("anthropic/claude-fable-5 ", "anthropic/claude-fable-5-1 "));
    expect(spliceModel(stack, "flux", "google/gemini-3.8-flash").updated).toBe(stack.replace('"google/gemini-3.7-flash"', '"google/gemini-3.8-flash"'));
    expect(spliceModel(stack, "hawk", `fireworks/${FW}deepseek-v4p1-flash`).updated).toContain(`model: 'fireworks/${FW}deepseek-v4p1-flash'\n`);
  });

  test("rejects unknown slots and non-list YAML", () => {
    expect(() => spliceModel(stack, "nobody", "anthropic/claude-fable-5-1")).toThrow(/no slot named nobody.*rune, flux, hawk/);
    expect(() => spliceModel("name: rune\nmodel: a/b\n", "rune", "a/c")).toThrow(/list of slots/);
  });
});
