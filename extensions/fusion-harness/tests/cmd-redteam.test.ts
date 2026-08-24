import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureUncommittedDiff, resolveRedteamTarget } from "../modules/cmd-redteam.ts";
import { assignRedteamLenses, REDTEAM_LENSES } from "../modules/prompt-library.ts";
import { loadModelStack, orderedSlots } from "../modules/model-stack.ts";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "fh-redteam-test-"));
  dirs.push(dir);
  return dir;
}

function initRepo(dir: string) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

const trioYaml = `
- name: architect
  model: anthropic/claude-fable-5
  architect: true
- name: main
  model: openai/gpt-5.6-sol
  primary: true
- name: reviewer
  model: google/gemini-3.6-flash
`;

function trioSlots() {
  const dir = tmpDir();
  const file = join(dir, "model-stack-trio.yaml");
  writeFileSync(file, trioYaml);
  return orderedSlots(loadModelStack(file));
}

describe("assignRedteamLenses", () => {
  test("a 3-slot stack lands exactly on correctness/security/performance, in slot order", () => {
    const assignments = assignRedteamLenses(trioSlots());
    expect(assignments.map((a) => a.lens.key)).toEqual(["correctness", "security", "performance"]);
    expect(assignments.map((a) => a.slot.id)).toEqual(["architect", "main", "reviewer"]);
  });

  test("cycles the fixed lens list if a stack ever exceeds it", () => {
    const slots = trioSlots();
    const oversized = [...slots, ...slots]; // 6 synthetic slots, only 5 real lenses
    const assignments = assignRedteamLenses(oversized);
    expect(assignments.map((a) => a.lens.key)).toEqual([
      "correctness", "security", "performance", "maintainability", "test-coverage", "correctness",
    ]);
    expect(REDTEAM_LENSES).toHaveLength(5);
  });
});

describe("resolveRedteamTarget", () => {
  test("an explicit target is used verbatim and never touches git", () => {
    const result = resolveRedteamTarget("the auth module in src/auth.ts", "/nonexistent/not-a-repo");
    expect(result).toEqual({ label: "TARGET", target: "the auth module in src/auth.ts" });
  });

  test("an oversized explicit target is capped like a diff would be, not sent whole to every lens", () => {
    const huge = "a".repeat(250_000);
    const result = resolveRedteamTarget(huge, "/nonexistent/not-a-repo");
    expect("usageError" in result).toBe(false);
    if (!("usageError" in result)) {
      expect(result.label).toBe("TARGET, truncated");
      expect(result.target.length).toBeLessThan(250_000);
      expect(result.target).toContain("chars elided");
    }
  });

  test("truncation never splits a surrogate pair at the cap boundary", () => {
    const target = `${"a".repeat(199_999)}😀`; // 😀 is a surrogate pair; its high half lands exactly at index 199999
    const result = resolveRedteamTarget(target, "/nonexistent/not-a-repo");
    expect("usageError" in result).toBe(false);
    if (!("usageError" in result)) {
      const [body] = result.target.split("\n… [truncated");
      expect(body).toBe("a".repeat(199_999)); // the lone high surrogate was dropped, not kept dangling
    }
  });

  test("no target and no git repo is a usage error, not a crash", () => {
    const dir = tmpDir(); // a real directory, but not a git repo
    const result = resolveRedteamTarget("", dir);
    expect("usageError" in result).toBe(true);
    if ("usageError" in result) expect(result.usageError).toContain("Usage: /fh-redteam [target]");
  });

  test("no target and a clean working tree is a usage error", () => {
    const dir = tmpDir();
    initRepo(dir);
    writeFileSync(join(dir, "a.txt"), "content\n");
    execFileSync("git", ["add", "a.txt"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: dir });
    const result = resolveRedteamTarget("", dir);
    expect("usageError" in result).toBe(true);
    if ("usageError" in result) expect(result.usageError).toContain("no uncommitted changes");
  });

  test("no target and an uncommitted diff defaults to that diff", () => {
    const dir = tmpDir();
    initRepo(dir);
    writeFileSync(join(dir, "a.txt"), "content\n");
    execFileSync("git", ["add", "a.txt"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: dir });
    writeFileSync(join(dir, "a.txt"), "changed content\n");
    const result = resolveRedteamTarget("", dir);
    expect("usageError" in result).toBe(false);
    if (!("usageError" in result)) {
      expect(result.label).toBe("UNCOMMITTED DIFF (git diff HEAD)");
      expect(result.target).toContain("changed content");
    }
  });

  test("captureUncommittedDiff reports a clear error for a non-repo directory", () => {
    const dir = tmpDir();
    const { diff, error } = captureUncommittedDiff(dir);
    expect(diff).toBe("");
    expect(error).toBeDefined();
  });
});
