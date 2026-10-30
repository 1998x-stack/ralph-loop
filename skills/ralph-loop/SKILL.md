---
name: ralph-loop
description: >
  Use Ralph Loop to develop PRD stories with fresh coding-agent contexts and
  independent verification. The Node CLI is the authoritative orchestrator.
---

# Ralph Loop — V1.2 Verified Execution

This Skill documents the V1.2 CLI-based workflow. The Plugin does **not** implement a second autonomous Hook loop: `SessionStart` and `Stop` hooks report status only.

## Prerequisites

- A Git target repository with nonempty valid `prd.json`, `CLAUDE.md`, and tests
- Node.js 20+, a configured coding-agent CLI
- A **trusted** `ralph.verify.json` with executable checks covering each Story

## Run

From the target project root:

```bash
node /path/to/ralph-loop/ralph-node.js --verify ralph.verify.json --dry-run
node /path/to/ralph-loop/ralph-node.js --verify ralph.verify.json --max-iterations 20
node /path/to/ralph-loop/ralph-node.js status
```

The engine selects one dependency-ready Story per iteration, spawns a fresh Agent process, rejects PRD and protected-check changes, and runs independent test commands. Only the deterministic Evaluator can set the Story state `passed` inside `.ralph/state.json`. The legacy `passes` PRD field is a claim and is never written as acceptance evidence by the verified runner.

## Recovery / limitations

- Each Story may retry up to `--max-attempts` (default 3); failures become Blocked when exhausted.
- `--max-no-progress` pauses a run after repeated failures; paused runs can restart.
- Unexpected running state and stale lock are **not** auto-recovered.
- Process separation is not an OS sandbox. Use only trusted workspaces until V1.3 isolation.
- No cost accounting, Worktree isolation, or LLM Judge exists in V1.2.
- Old unverified CLI can only be used deliberately with `--legacy-unverified`.

See `docs/v1.2-migration.md`.
