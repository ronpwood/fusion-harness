# Opportunities: other orchestration modes

Notes from designing `/fh-redteam` (`modules/cmd-redteam.ts`) on other modes that fit
the `HarnessDeps` seam cleanly, plus what a heavier one (tournament) would actually cost.
Nothing here is scheduled — write-up only, for whenever one of these is picked up.

## Critic pass (`/fh-critique`)

One agent already produced something — Main's last build, a `/fh-collaborate` result,
an arbitrary file — and the other configured slots critique it read-only, then (optionally)
Main gets one rebuttal/fix round.

- **Shape**: reuses `/fh-debate`'s labeled-round-injection primitive (`debateOpinionsBlock`
  in `prompt-library.ts`), but asymmetric — one producer, N critics — instead of debate's
  symmetric all-to-all.
- **Target resolution**: same problem `/fh-redteam` solved — critics need something concrete
  to react to. `resolveRedteamTarget`/`captureUncommittedDiff` in `cmd-redteam.ts` are directly
  reusable (a "critique the current diff" default is the same shape as "red-team the current
  diff" — this is the same command with a different prompt contract, not a different engine).
- **Value over `/fh-redteam`**: redteam fixes each agent's lens in advance (independent,
  parallel, no cross-talk). Critique lets the *other* models react to the SPECIFIC artifact
  with full context of what was intended, which surfaces "you said you'd do X but Y instead"
  mismatches redteam's fixed lenses won't naturally reach. Worth building only if that
  distinction earns its keep in practice — it's easy to end up with two commands that produce
  near-identical output for the common case (reviewing a diff).

## Judge / vote (`/fh-judge`)

Every slot answers independently (exactly `/fh-opinion`'s fan-out), then one designated
agent — reuse `/fh-fusion`'s temporary-agent pattern (`fuserPrompt` shape in
`prompt-library.ts`), but **read-only**, no writer lease — picks a winner or ranks the
answers with justification, instead of merging them into one blended result.

- **Shape**: `/fh-opinion`'s fan-out + a `/fh-fusion`-style single final agent, with
  `tools: READONLY_TOOLS` on the judge (never `FULL_TOOLS` — a judge that can write isn't a
  judge, it's `/fh-fusion` with a different prompt).
- **Value**: `/fh-fusion` always blends; sometimes you want a *decision* between competing
  approaches (which library, which architecture, which of two diffs) without paying for a
  full merge-and-implement pass, and without leaving the choice entirely to the user the way
  `/fh-debate` does (debate has no judge by design — that's a feature there, a gap here).
- **Open question**: does the judge get to be one of the N answering slots, or does it need
  to be a temporary agent outside the roster (like FUSION) so it isn't grading its own
  answer? Precedent (`/fh-fusion`) says temporary/outside-roster.

## Tournament bracket — architectural requirements, not a design

This is the one flagged as NOT "free" the way the above two are. What it needs that
`HarnessDeps` doesn't currently provide:

1. **Cross-round elimination state.** Opinion/debate/redteam are stateless per invocation —
   every slot participates every round. A bracket needs "who's still in, who's out, what
   beat what" carried between rounds. `/fh-collaborate`'s DAG executor
   (`collaboration-graph.ts`) is the closest existing precedent for a module owning
   nontrivial cross-turn state itself (in its own closure/artifacts, not in `HarnessDeps`) —
   but a DAG is declared once and executed to completion in one command invocation; a
   bracket's rounds are more naturally *separate* invocations (`/fh-tournament`, then
   `/fh-tournament --advance` or similar), which the current one-shot command model doesn't
   have a pattern for at all.
2. **A judge, recursively.** Each bracket round needs the judge/vote primitive above (or a
   human-in-the-loop pick via `ctx.ui.select`, which `/fh-model`'s provider/model picker in
   `fusion-harness.ts` already demonstrates is available). Tournament is not buildable before
   judge/vote exists in some form.
3. **Persistence across invocations.** Every existing command runs start-to-finish in one
   `pi.registerCommand` handler call; bracket state (current round, standings, per-match
   artifacts) needs to survive between handler invocations. That's new: either a small state
   file under the run's artifacts dir that the next `/fh-tournament` call reads back, or a
   session-scoped module-level variable (fragile — lost on `/fh-reset`, `/new`, or restart,
   and `HarnessDeps` has no "give me my last state" primitive today).
4. **A bracket panel.** `FhDetails.kind` has no bracket-shaped variant — `multi`/`duo`/`closing`
   assume every agent's answer renders once, side by side. A bracket wants a shrinking column
   count per round (5 slots → fewer as they're eliminated) and a standings view across rounds,
   which is a new `tui.ts` renderer, not a reuse of `AgentGrid`/`TwoCol` as-is.
5. **Slot-count mismatch at the edges.** Stacks are capped at 2-5 slots (`model-stack.ts`).
   A single-elimination bracket wants a power-of-two field; 3 or 5 slots need a bye or a
   round-robin fallback for the odd one out, which is bracket-logic the harness doesn't need
   to solve for anything else today.

Net: buildable, but it's the first mode that needs the harness to hold state across command
invocations at all — every other mode (including `/fh-collaborate`'s DAG) is one-shot. That's
a real new capability, not just a new `cmd-*.ts` file plus a registration call.
