# ADR 0004 — One Authoritative Orchestrator

Status: Accepted for V1.1; independent acceptance remains future work.

## Context

The V1 repository contains two duplicated CLI implementations and Claude skills/hooks that describe a third scheduling path. This allowed PRD state calculation to diverge between Bash, Node, and hook scripts. The design documentation described shared orchestration that was not actually wired.

## Decision

- Use `src/core/prd-state.js` as the only PRD parser, validator and scheduler.
- Use `src/core/runner.js` as the authoritative local execution loop.
- `bin/ralph`, `ralph.sh`, and `bin/ralph-node` delegate to `ralph-node.js`.
- Hook scripts display status; they do not schedule or claim acceptance.
- Reject malformed PRDs, cycles, unknown dependencies and empty story arrays before running.
- Only one ready story may become passed in each iteration; stop on malformed agent output or failed process status.
- A Story with `blocked` status is not considered passed.
- Remove unsafe permission bypass from the default CLI invocation.
- Unimplemented `--cost-limit` fails fast.

## Limitations

Legacy `passes` is still editable by the coding agent, and **cannot prove correctness**. V1.2/V1.3 must introduce externally stored test results and an independent completion gate. Attempt counters and recovery metadata are not durable yet. The process boundary does not provide filesystem isolation.

## Next decisions

V1.2: typed runtime adapters and persistent attempts.
V1.3: independent test runner, Worktree isolation and evaluator evidence.
V1.4: SQLite event log, budget accounting and crash recovery.
