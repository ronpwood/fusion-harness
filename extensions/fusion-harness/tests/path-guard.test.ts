import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import { findDenyMatch } from "../child-extensions/path-guard-rules.ts";

const CWD = "/Users/fake/project";

describe("path-guard deny-list matching", () => {
  test("blocks .env at project root", () => {
    expect(findDenyMatch(".env", CWD)).toBeDefined();
    expect(findDenyMatch(`${CWD}/.env`, CWD)).toBeDefined();
  });

  test("does not block a nested file that merely contains 'env' in its name", () => {
    expect(findDenyMatch("src/env.ts", CWD)).toBeUndefined();
    expect(findDenyMatch(`${CWD}/src/env.ts`, CWD)).toBeUndefined();
  });

  test("blocks ~/.ssh/id_rsa both as an absolute path and as a ~-relative path", () => {
    const absolute = `${os.homedir()}/.ssh/id_rsa`;
    expect(findDenyMatch(absolute, CWD)).toBeDefined();
    expect(findDenyMatch("~/.ssh/id_rsa", CWD)).toBeDefined();
  });

  test("blocks a bare `ls ~/.ssh` on the directory itself, not just files inside it", () => {
    // Regression: caught live — a directory pattern with a trailing slash only matched
    // paths strictly INSIDE the directory; the bare directory itself (no trailing slash on
    // the candidate, e.g. an `ls` call) slipped through uncaught.
    expect(findDenyMatch("~/.ssh", CWD)).toBeDefined();
    expect(findDenyMatch(os.homedir() + "/.ssh", CWD)).toBeDefined();
  });

  test("does not false-positive on a similarly-named but distinct directory", () => {
    expect(findDenyMatch("~/.ssh-backup", CWD)).toBeUndefined();
  });

  test("blocks a grep glob targeting *.pem", () => {
    expect(findDenyMatch("**/*.pem", CWD)).toBeDefined();
  });

  test("blocks common credential file shapes", () => {
    expect(findDenyMatch("aws-credentials.json", CWD)).toBeDefined();
    expect(findDenyMatch("serviceAccountKey.json", CWD)).toBeDefined();
    expect(findDenyMatch("id_rsa.pem", CWD)).toBeDefined();
  });

  test("does not block an ordinary project file", () => {
    expect(findDenyMatch("README.md", CWD)).toBeUndefined();
    expect(findDenyMatch("extensions/fusion-harness/modules/runtime.ts", CWD)).toBeUndefined();
  });
});
