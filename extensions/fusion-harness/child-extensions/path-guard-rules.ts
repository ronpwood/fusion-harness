/**
 * path-guard-rules.ts — the pure deny-list and path-matching logic behind path-guard.ts.
 *
 * Split out from path-guard.ts so it has ZERO dependency on `@earendil-works/pi-coding-agent`
 * (that package is only resolvable inside pi's own runtime, not under a plain `bun test`) —
 * matches this codebase's existing pattern of separating pure logic (`runtime.ts`) from the
 * modules that wire it into pi (`child-runner.ts`, and here, `path-guard.ts`).
 *
 * Path matching is ported from a sibling `pi` extension
 * (`pi-vs-claude-code/extensions/damage-control.ts`'s `resolvePath`/`isPathMatch`), not
 * reimplemented from scratch.
 */

import * as os from "node:os";
import * as path from "node:path";

// Fixed and hardcoded — NOT a per-project loaded YAML like the sibling repo's
// `.pi/damage-control-rules.yaml`. This extension ships with the harness and is not
// operator-tunable per project, so there is no config file an injected prompt could try
// to point elsewhere. Trimmed from that sibling repo's `zeroAccessPaths` to what a
// read-only reviewer child could plausibly encounter.
export const DENY_PATTERNS: string[] = [
	".env",
	".env.*",
	"*.env",
	"~/.ssh/",
	"~/.aws/",
	"~/.config/gcloud/",
	"~/.azure/",
	"~/.kube/",
	"~/.docker/",
	"*.pem",
	"*.key",
	"*.p12",
	"*.pfx",
	"*-credentials.json",
	"*serviceAccount*.json",
	"*service-account*.json",
	"~/.netrc",
	"~/.npmrc",
	"~/.git-credentials",
];

/** Expand a leading `~` and resolve against `cwd` — same contract as `damage-control.ts`. */
export function resolvePath(p: string, cwd: string): string {
	if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
	return path.resolve(cwd, p);
}

/** Simple glob-to-regex/substring match — a heuristic, not a full glob engine, by design (ported as-is). */
export function isPathMatch(targetPath: string, pattern: string, cwd: string): boolean {
	const resolvedPattern = pattern.startsWith("~") ? path.join(os.homedir(), pattern.slice(1)) : pattern;
	if (resolvedPattern.endsWith("/")) {
		const absolutePattern = path.isAbsolute(resolvedPattern) ? resolvedPattern : path.resolve(cwd, resolvedPattern);
		// A bare `ls ~/.ssh` (no trailing slash on the CANDIDATE) must match a directory
		// pattern too, not just paths strictly inside it — `targetPath.startsWith(absolutePattern)`
		// alone requires targetPath to already carry the trailing slash, which listing the
		// directory itself never does. Caught live: an `ls` on the directory itself sailed
		// through while a `read` of a file inside it correctly blocked.
		return targetPath === absolutePattern.slice(0, -1) || targetPath.startsWith(absolutePattern);
	}
	const regexPattern = resolvedPattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars
		.replace(/\*/g, ".*"); // convert * to .*
	const regex = new RegExp(`^${regexPattern}$|^${regexPattern}/|/${regexPattern}$|/${regexPattern}/`);
	const relativePath = path.relative(cwd, targetPath);
	return regex.test(targetPath) || regex.test(relativePath) || targetPath.includes(resolvedPattern) || relativePath.includes(resolvedPattern);
}

/** The first deny-list pattern a candidate path/glob matches, if any. */
export function findDenyMatch(candidate: string, cwd: string): string | undefined {
	const resolved = resolvePath(candidate, cwd);
	return DENY_PATTERNS.find((pattern) => isPathMatch(resolved, pattern, cwd));
}
