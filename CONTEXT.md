# Ralph Loop

A deterministic-autonomous AI agent system. A loop coordinator spawns fresh agent instances with zero context memory. Each instance reads state from files, completes ONE user story, writes state back, and exits. The only persistent memory is the file system.

## Language

**Ralph Loop**:
The entire system — coordinator + subagents + state files + plugin. Named after the Geoffrey Huntley "Ralph Wiggum" technique.
_Avoid_: loop, agent loop, autonomous runner

**Coordinator**:
The main Claude session that drives the loop. It reads prd.json, selects pending stories, spawns coding agents as subagents, and updates state. The coordinator never implements code directly — it only orchestrates.
_Avoid_: driver, main agent, orchestrator (OK as synonym)

**Coding Agent**:
A subagent spawned by the coordinator to implement a single user story. Gets fresh context per story. Reads AGENTS.md + prd.json to orient, implements, verifies, and returns structured results. Terminates after one story.
_Avoid_: worker, implementer, iteration agent

**Debug Agent**:
A specialized subagent spawned when a story fails 2+ attempts. Analyzes the codebase, identifies root cause, proposes a fix. The coding agent applies it.
_Avoid_: fixer, repair agent

**Initializer Agent**:
A subagent that runs once to scaffold a target project for Ralph Loop. Generates prd.json, init.sh, AGENTS.md, progress.txt, and initial git commit. Does not implement features.
_Avoid_: scaffolder, setup agent

**prd.json**:
The single source of truth for task state. Contains an array of user stories, each with `passes: bool`, `status`, `priority`, and `dependencies`. The coordinator reads this to decide what to work on. The coding agent updates `passes` after verification.
_Avoid_: task list, manifest, requirements doc

**User Story**:
A single unit of work. Must be completable within one subagent context window (~120k tokens). Includes id, description, acceptance criteria, verification method, and estimated effort.
_Avoid_: task, feature, ticket

**Completion Signal**:
The XML tag `<promise>COMPLETE</promise>` that a coding agent outputs when finished. The coordinator detects this. Double-verified against prd.json state before accepting.
_Avoid_: done signal, finish marker

**progress.txt**:
Cross-session handoff diary. Each coding agent appends a session entry with story id, status, changes, and next story. Human-readable but also parseable by the coordinator for recovery.
_Avoid_: log, journal, changelog

**AGENTS.md**:
Living convention manual for the target project. Maintained cumulatively by coding agents. Contains project-specific rules, known gotchas, and learnings. Read at the start of every coding agent session.
_Avoid_: project manual, conventions doc

**Fresh Context**:
A new Claude instance with zero memory of prior iterations. Guarantees no context rot from previous work. The subagent boundary is the context boundary — every story starts clean.
_Avoid_: clean slate, new session

**Dumb Zone**:
The context window saturation point (~70%+ utilization) where agent output quality degrades — hallucinations increase, early constraints are forgotten, decisions become erratic. Ralph prevents entering this by isolating stories in fresh subagent contexts.
_Avoid_: context rot, saturation zone

**Blocked**:
Story status after 2+ failed fix attempts. The coordinator skips blocked stories, logs the reason to progress.txt, and spawns a debug agent for analysis. Blocked stories can be retried after human intervention or debug agent resolution.
_Avoid_: stuck, failed, skipped

**Worktree**:
A `git worktree` — an isolated checkout of the repository used for parallel story execution. Each parallel story runs in its own worktree, avoiding merge conflicts. Merged back to main when complete.
_Avoid_: branch workspace, sandbox

## Relationships

- The **Coordinator** spawns one **Coding Agent** per **User Story**
- A **Coding Agent** reads **prd.json** → implements → verifies → updates **prd.json** + appends **progress.txt**
- If a **Coding Agent** fails 2+ times, the **Coordinator** spawns a **Debug Agent** → marks the story **Blocked**
- The **Initializer Agent** runs once before any **Coding Agent** to create **prd.json**, **AGENTS.md**, and **progress.txt**
- **Parallel stories** run in isolated **Worktrees**, merged sequentially after all complete
- The **Completion Signal** is double-verified: signal found in output AND **prd.json** confirms `passes: true`

## Example Dialogue

> **User:** "I want to build a SaaS app with user auth, dashboards, and billing."
> **Initializer Agent:** "Let me ask some questions to generate your prd.json..."
> _(generates 80 stories in prd.json, creates AGENTS.md, init.sh, progress.txt, git init)_
> **User:** "Ready. Run Ralph."
> **Coordinator:** "Loading prd.json... 80 stories, 0 complete. Starting with setup-001: project foundation. Spawning coding agent..."
> **Coding Agent (subagent, fresh context):** _(reads AGENTS.md, prd.json, git log → implements setup-001 → verifies → passes: true → commits)_ `<promise>COMPLETE</promise>`
> **Coordinator:** "setup-001 passed. 79 remaining. Next: auth-001. Spawning coding agent..."
> ...

## Flagged Ambiguities

- "iteration" was used to mean both the loop cycle and the subagent execution — resolved: use "iteration" for the loop cycle, "coding agent session" for subagent execution.
- "init" was overloaded (init.sh script vs initialization agent vs plugin init command) — resolved: `init.sh` is the environment bootstrap script, "Initializer Agent" is the subagent, `/ralph-loop:init` is the plugin command.
