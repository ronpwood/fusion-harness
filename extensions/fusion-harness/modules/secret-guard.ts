/**
 * secret-guard.ts — the harness's own defenses against a child leaking a loaded secret.
 *
 * Two independently testable controls, both driven by the host's own `process.env`:
 * `redactSecrets` scrubs a secret-shaped env value out of finished child text (output-side
 * hard boundary), and `scopedChildEnv` narrows what a child's environment holds in the
 * first place (blast-radius reduction). See
 * specs/harden-readonly-children-secret-exfiltration.md for the full threat model.
 */

const SECRET_NAME_PATTERN = /API[_-]?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY/i;
const MIN_SECRET_LENGTH = 16; // below this, a "secret" is too likely to be a common short string

/**
 * Replace every verbatim occurrence of a currently-loaded, secret-shaped env value with
 * `[REDACTED:<VAR_NAME>]`. Plain string matching over values the host process already
 * holds — holds even if a model ignores every prompt-level instruction not to reproduce
 * credentials, because it doesn't depend on the model's cooperation at all.
 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
	if (!text) return text;
	let redacted = text;
	for (const [name, value] of Object.entries(env)) {
		if (!value || value.length < MIN_SECRET_LENGTH) continue;
		if (!SECRET_NAME_PATTERN.test(name)) continue;
		redacted = redacted.split(value).join(`[REDACTED:${name}]`);
	}
	return redacted;
}

// ═══ Per-child environment scoping ═══════════════════════════════════════════

/** `run.model`'s provider prefix (`"anthropic/claude-fable-5"` → `anthropic`) → the one env var that provider's key lives in. */
export const PROVIDER_ENV_VARS: Record<string, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	// pi reads GEMINI_API_KEY for the google provider — GOOGLE_GENERATIVE_AI_API_KEY is NOT
	// consulted (same gotcha already documented in README.md / .claude/commands/install.md).
	google: "GEMINI_API_KEY",
	openai: "OPENAI_API_KEY",
	fireworks: "FIREWORKS_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

// What a spawned `pi` child (and whatever it shells out to internally) needs to run at
// all, independent of which provider it's talking to. Verified empirically against every
// stack this repo ships (see Phase 2 validation in the plan) rather than assumed.
const BASE_ENV_ALLOWLIST = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP", "TERM"];

/**
 * Build the minimal environment one child needs: the base allowlist, pi's own
 * offline/version-check flags, and — if `model`'s provider has a known key var and it's
 * present in `hostEnv` — that ONE provider's key. No other provider's key is ever copied
 * in, so a compromised child never had access to it in the first place (blast-radius
 * reduction, independent of and in addition to `redactSecrets`'s output-side redaction).
 */
export function scopedChildEnv(model: string, hostEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const provider = model.split("/")[0];
	if (!provider || !(provider in PROVIDER_ENV_VARS)) {
		throw new Error(`secret-guard: unknown provider "${provider}" for model "${model}" — add it to PROVIDER_ENV_VARS in secret-guard.ts before wiring a stack that uses it`);
	}
	const scoped: NodeJS.ProcessEnv = { PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" };
	for (const name of BASE_ENV_ALLOWLIST) {
		const value = hostEnv[name];
		if (value !== undefined) scoped[name] = value;
	}
	const keyVar = PROVIDER_ENV_VARS[provider];
	const keyValue = hostEnv[keyVar];
	if (keyValue !== undefined) scoped[keyVar] = keyValue;
	return scoped;
}
