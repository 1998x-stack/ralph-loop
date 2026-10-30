# ADR 0005 — Independent deterministic acceptance gate

Status: Implemented in V1.2 (process-level isolation only)

## Decision

1. CLI requires `--verify` in standard autonomous mode; `--legacy-unverified` explicitly opts into previous unsafe behavior.
2. Agent edits code but must not update the PRD, test sources or verification manifest.
3. Story, Attempt and Run have explicit state transitions; only the external evaluator can mark Story `passed`.
4. A trusted check manifest selects non-shell `argv` commands per story. A separate subprocess executes each check, retaining result and output.
5. Protected input hashes are compared before and after verification; changes fail closed.
6. State and evidence are persisted under `.ralph/`, with exclusive run lock and atomic state writes.

## Limitations

No process identity isolation or container sandbox yet; filesystem evidence and configuration live inside the same permission domain as the Coding Agent. Native worktree sandbox and externally protected storage are required before use on untrusted repositories. Execution does not automatically recover a crashed in-progress run. CLI cost accounting remains unimplemented. Tests and the deterministic gate establish evidence for *configured checks* only, not general program correctness.
