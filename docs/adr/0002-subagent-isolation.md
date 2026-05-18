# ADR 0002: Subagent Isolation for Story Execution

Each user story runs as an isolated Claude subagent with a fresh context window, rather than being implemented inline in the coordinator's session or via external subprocess.

## Why

**Hard to reverse.** The execution model defines how state is tracked, how context is managed, how errors are recovered, and how the coordinator communicates with the implementer. Switching back to an inline or subprocess model would require rewriting the coordinator's orchestration logic, progress tracking, and error recovery.

**Surprising without context.** The current Ralph Loop uses `claude -p` subprocesses — each iteration is a fresh OS process, not a Claude subagent. A future reader might wonder why we switched from the simpler subprocess model. The subagent approach is not obviously better without understanding the tradeoffs: subagents give the coordinator programmatic access to results (structured output, exit codes, token usage), while subprocesses only give raw text output.

**Real trade-off.** The subprocess model (current) guarantees true OS-level isolation but requires text parsing for progress tracking and has no structured error handling. The subagent model gives structured output and richer error recovery, but both approaches achieve the "fresh context" guarantee. The subagent model was chosen because the coordinator needs structured data to implement cost tracking, smart error recovery, and parallel execution — all of which require more than text parsing.

## Decision

- Each story implementation runs as a Claude subagent spawned by the coordinator.
- The subagent receives the CLAUDE.md prompt template (with project-specific substitutions), plus the story's acceptance criteria.
- The subagent returns structured output: `{ storyId, status, summary, verificationResult, tokensUsed }`.
- If the subagent crashes or hits context limit, the coordinator retries with the same prompt. The subagent is encouraged to stash partial work before crashing.
- The inline model is used only for the coordinator itself (which stays lean — it only reads prd.json + progress.txt, never code).

## Considered Alternatives

- **Keep subprocess model (`claude -p`):** Familiar, proven, simpler to debug. Rejected because the coordinator needs structured output for cost tracking, error classification, and parallel orchestration. Parsing unstructured text from subprocess is fragile.
- **Inline implementation (coordinator implements directly):** Simplest — no subprocess or subagent overhead. Rejected because the coordinator's context would accumulate across stories, entering the Dumb Zone. This is the very problem Ralph was designed to solve.
