# ADR 0003: Hooks-Based Autonomous Loop Coordination

The Ralph Loop coordinator is driven by Claude Code hooks (`SessionStart`, `PostToolUse`) rather than an external Bash `while` loop (`ralph.sh`). A CLI binary (`bin/ralph`) remains as a fallback for standalone use.

## Why

**Hard to reverse.** The choice between hooks-driven and subprocess-driven coordination shapes how state is checked, how iterations are triggered, and how the system integrates with Claude Code. Switching would require rewriting the coordination logic and changing the plugin manifest.

**Surprising without context.** The current Ralph Loop is defined by `ralph.sh` — a Bash `while` loop that spawns `claude -p` subprocesses. The name "Ralph Loop" literally refers to this mechanism. A future reader might expect the plugin to work the same way and be confused by the hooks-based approach. The hooks model leverages Claude Code's native lifecycle events rather than building an external loop driver.

**Real trade-off.** The subprocess loop (`ralph.sh`) is standalone — it works without Claude Code, in CI/CD, on any machine with Bash. It's battle-tested and simple. The hooks model requires Claude Code to be running, but gives: native integration with the plugin system, no external process management, automatic state checking on session start, and the ability to pause/resume across sessions. The CLI binary is kept as a fallback, maintaining the standalone use case.

## Decision

- Primary: `SessionStart` hook checks prd.json for pending stories. If found, the coordinator spawns coding agent subagents in sequence.
- `PostToolUse` hook on subagent completion checks results, updates prd.json, and triggers the next story.
- Fallback: `bin/ralph` CLI binary provides the same loop logic as a standalone process for CI/CD, headless servers, and users who prefer terminal control.
- Both the hook coordinator and the CLI binary share the same core orchestration logic (implemented in `ralph-node.js`).

## Considered Alternatives

- **Pure subprocess loop only:** Keep `ralph.sh` as the sole mechanism. Rejected because it doesn't integrate with Claude Code's plugin lifecycle — users would need to run a separate terminal for the loop, losing the unified plugin experience.
- **Hooks only, no CLI binary:** Cleaner plugin, simpler to maintain. Rejected because it removes the CI/CD and headless use case. Many Ralph users run it unattended on servers where Claude Code isn't running interactively.
