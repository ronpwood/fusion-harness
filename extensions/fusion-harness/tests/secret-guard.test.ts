import { describe, expect, test } from "bun:test";
import { redactSecrets, scopedChildEnv } from "../modules/secret-guard.ts";

describe("redactSecrets", () => {
  test("redacts a secret-shaped env value embedded in arbitrary text", () => {
    const env = { FAKE_API_KEY: "a".repeat(32) };
    const text = `before ${env.FAKE_API_KEY} after`;
    expect(redactSecrets(text, env)).toBe("before [REDACTED:FAKE_API_KEY] after");
  });

  test("leaves a short (<16 char) env value untouched", () => {
    const env = { FAKE_API_KEY: "short" };
    const text = `value is ${env.FAKE_API_KEY}`;
    expect(redactSecrets(text, env)).toBe(text);
  });

  test("passes text through unchanged when no secret-shaped env vars are present", () => {
    const env = { PATH: "/usr/bin", LANG: "en_US.UTF-8" };
    const text = "nothing sensitive here, just prose";
    expect(redactSecrets(text, env)).toBe(text);
  });

  test("redacts multiple distinct secrets in one string independently", () => {
    const env = { FIRST_API_KEY: "b".repeat(20), SECOND_SECRET_TOKEN: "c".repeat(24) };
    const text = `${env.FIRST_API_KEY} and ${env.SECOND_SECRET_TOKEN} together`;
    expect(redactSecrets(text, env)).toBe("[REDACTED:FIRST_API_KEY] and [REDACTED:SECOND_SECRET_TOKEN] together");
  });

  test("a 3-char env value is never matched regardless of name", () => {
    const env = { TINY_API_KEY: "xyz" };
    const text = "the value is xyz here";
    expect(redactSecrets(text, env)).toBe(text);
  });

  test("empty text and empty env are no-ops", () => {
    expect(redactSecrets("", { FAKE_API_KEY: "d".repeat(20) })).toBe("");
    expect(redactSecrets("some text", {})).toBe("some text");
  });
});

describe("scopedChildEnv", () => {
  const fakeEnv = {
    PATH: "/usr/bin:/bin",
    HOME: "/home/fake",
    ANTHROPIC_API_KEY: "anthropic-secret",
    OPENAI_API_KEY: "openai-secret",
    GEMINI_API_KEY: "gemini-secret",
    FIREWORKS_API_KEY: "fireworks-secret",
    OPENROUTER_API_KEY: "openrouter-secret",
    SOME_OTHER_VAR: "irrelevant",
  };

  test("keeps only the requested provider's key, never the other four", () => {
    const scoped = scopedChildEnv("anthropic/claude-fable-5", fakeEnv);
    expect(scoped.ANTHROPIC_API_KEY).toBe("anthropic-secret");
    expect(scoped.OPENAI_API_KEY).toBeUndefined();
    expect(scoped.GEMINI_API_KEY).toBeUndefined();
    expect(scoped.FIREWORKS_API_KEY).toBeUndefined();
    expect(scoped.OPENROUTER_API_KEY).toBeUndefined();
  });

  test("carries the base allowlist through and drops everything else", () => {
    const scoped = scopedChildEnv("openai/gpt-5.6-sol", fakeEnv);
    expect(scoped.PATH).toBe(fakeEnv.PATH);
    expect(scoped.HOME).toBe(fakeEnv.HOME);
    expect(scoped.SOME_OTHER_VAR).toBeUndefined();
    expect(scoped.PI_OFFLINE).toBe("1");
    expect(scoped.PI_SKIP_VERSION_CHECK).toBe("1");
  });

  test("google provider maps to GEMINI_API_KEY, not a GOOGLE_* var", () => {
    const scoped = scopedChildEnv("google/gemini-3.7-flash", fakeEnv);
    expect(scoped.GEMINI_API_KEY).toBe("gemini-secret");
  });

  test("an unknown provider fails loudly instead of silently degrading", () => {
    expect(() => scopedChildEnv("mystery-provider/some-model", fakeEnv)).toThrow(/unknown provider/i);
  });
});
