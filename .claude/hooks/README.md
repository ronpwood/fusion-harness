# Outer-session hooks

Claude Code hooks for the session you run *in this repo* (and any checkout that shares
`.claude/settings.json`). They protect the outer session only; pi children get their
own guards from `extensions/fusion-harness/child-extensions/path-guard.ts` and
`modules/secret-guard.ts`. See `ai_docs/function-hooks-20.md` for the hook contract.

| Hook | Event / matcher | Decision | Guards against |
|---|---|---|---|
| `guard-secrets.sh` | PreToolUse: Read, Grep, Glob, Bash | deny | reading, grepping, globbing, catting, or sourcing credential files; whole-environment dumps |
| `redact-secrets.sh` | PostToolUse: Read, Grep, Bash | `updatedToolOutput` | any secret-shaped value (from the session environment or the project's dotenv file) reaching the transcript |
| `block-destructive.sh` | PreToolUse: Bash | deny / ask | force pushes, hard resets, `clean -f`, `branch -D`, `stash drop`; recursive `rm` outside lab/build output (deny) or inside it (ask) |
| `check-writer-lease.sh` | PreToolUse: Write, Edit, MultiEdit, NotebookEdit, mutating Bash | ask | editing while a live harness process holds the writer lease for this cwd |

All hooks are exec form (`args: []`) with `${CLAUDE_PROJECT_DIR}` so paths need no quoting.
They need `jq` and `bash`. `check-writer-lease.sh` hashes the hook input's `cwd` the same
way `writer-lease.ts` does and never takes or deletes a lease.

Test offline, no live session required:

```
.claude/hooks/test.sh
```

`test.sh` regenerates `fixtures/` from `make-fixtures.sh`, pipes each fixture into its hook
on stdin, and asserts the decision. The lease test spawns a throwaway `sleep` as a fake
lease holder and cleans it up; it is skipped if a real lease exists.

Limits worth knowing:

- Token matching in `guard-secrets.sh` is best-effort, like the reference's own `if`
  filter. A command that builds a credential path from variables can slip past it; the
  PostToolUse redaction is the backstop. It also matches literal credential-path tokens
  anywhere in a Bash command, including heredoc bodies, so write such text with the
  Write or Edit tool rather than a shell heredoc.
- `updatedToolOutput` only changes what Claude sees. The tool already ran.
- Hooks do not run until the workspace is trusted in an interactive session, and they
  *do* run without a prompt in `claude -p`. Review `.claude/` before scripting `-p` over an
  untrusted checkout.
