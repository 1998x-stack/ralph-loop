# ⟳ Ralph Loop

> **Deterministic-autonomous AI agent system.** A loop spawns fresh agents with zero context memory until every task is verifiably complete. The only "memory" is the file system.

[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-brightgreen)]()
[![Bash](https://img.shields.io/badge/runtime-bash-orange)]()
[![Node.js](https://img.shields.io/badge/runtime-node.js-blue)]()
[![Claude Code Plugin](https://img.shields.io/badge/plugin-claude%20code-teal)]()

<p align="center">
  <img src="https://raw.githubusercontent.com/1998x-stack/ralph-loop/main/docs/architecture.svg" alt="Ralph Loop Architecture" width="720">
</p>

---

## The Problem

LLM context windows have no `free()`. Every tool call and file read accumulates — and after ~70% utilization, agents enter the **Dumb Zone**: hallucinating, forgetting early constraints, making increasingly poor decisions.

Single-session agents degrade. Multi-session agents lose state. Most "autonomous" approaches are fragile.

## The Solution

Ralph Loop never lets an agent enter the Dumb Zone. Every iteration spawns a **fresh agent instance with zero context**. The agent:

1. **Reads** state from files (`prd.json`, `progress.txt`, `AGENTS.md`, git log)
2. **Implements exactly one** user story
3. **Verifies** via browser automation or API tests
4. **Commits** code + updates state files
5. **Outputs** `<promise>COMPLETE</promise>`

The outer loop detects the signal, verifies `prd.json`, and spawns the next iteration. Repeat until all stories pass.

```
┌───────────────────────────────────────────┐
│  while true:                              │
│    spawn fresh agent (zero memory)        │
│    agent reads files → works → commits    │
│    check for <promise>COMPLETE</promise>  │
│    → Found? verify prd.json → exit?      │
│    → Not found? next iteration            │
└───────────────────────────────────────────┘
```

## Features

- **Fresh context per iteration** — No context rot. Subagent isolation guarantees every story starts clean.
- **File-based state machine** — `prd.json` is the single source of truth. `progress.txt` is the cross-session handoff diary. Git is the code snapshot.
- **Browser-verified acceptance** — Frontend stories must pass browser automation (Puppeteer/Playwright). External, reproducible verification.
- **Smart error recovery** — 2 failures → auto-revert → mark BLOCKED → spawn debug subagent. Never force broken stories.
- **Claude Code plugin** — Install once, reuse across projects. Skills, agents, hooks — auto-discovered. Namespaced commands (`/ralph-loop:run`).
- **Dual runtime** — Bash (`ralph.sh`) for simplicity, Node.js (`ralph-node.js`) for programmatic control, hooks for autonomous mode.

## Quick Start

### Install as Claude Code Plugin

```bash
# Clone the plugin
git clone https://github.com/1998x-stack/ralph-loop.git

# Install into Claude Code
claude plugin install ./ralph-loop --scope local

# Verify installation
claude plugin list  # should show ralph-loop
```

### Generate Your PRD

```bash
# In Claude Code, describe your project
/ralph-loop:generate-prd

# This generates prd.json with 50–200 user stories,
# each small enough for one context window.
```

### Initialize Your Project

```bash
# In Claude Code, scaffold your target project
/ralph-loop:init

# This creates:
#   init.sh       — environment bootstrap
#   AGENTS.md     — project conventions
#   progress.txt  — cross-session handoff diary
```

### Run the Loop

```bash
# Autonomous mode (Claude Code)
/ralph-loop:run

# Standalone CLI mode
bin/ralph run --max-iterations 100 --verbose

# Programmatic (Node.js)
node ralph-node.js --max-iterations 50 --cost-limit 20
```

## Architecture

```
ralph-loop/                     ← plugin root
├── .claude-plugin/
│   └── plugin.json             ← manifest
├── skills/
│   ├── ralph-loop/             ← /ralph-loop:run
│   │   └── SKILL.md
│   ├── generate-prd/           ← /ralph-loop:generate-prd
│   │   └── SKILL.md
│   └── initialize-project/     ← /ralph-loop:init
│       └── SKILL.md
├── agents/
│   ├── ralph-coding-agent.md
│   ├── ralph-initializer.md
│   └── ralph-debugger.md
├── hooks/
│   └── hooks.json
├── bin/
│   ├── ralph                    ← CLI binary
│   └── ralph-node
├── templates/                   ← CLAUDE.md, AGENTS.md, prd.json
├── .mcp.json                    ← bundled Puppeteer MCP
└── docs/                        ← ADRs, technical docs
```

## Core Constraints

| Rule | Description |
|------|-------------|
| **One story per iteration** | Never more. Each story must fit in one context window. |
| **Browser-verified only** | Frontend stories must pass browser automation. No "looks good to me." |
| **Never delete passing tests** | Tests are the safety net. Never remove a passing test. |
| **2-failure bailout** | If a story fails twice, `git revert` → mark BLOCKED → move on. |
| **Git commit every iteration** | Every iteration ends with a clean commit and updated `progress.txt`. |
| **Completion signal required** | `<promise>COMPLETE</promise>` — double-verified against `prd.json`. |

## State Machine

```
prd.json (passes: false)
    → Agent picks highest-priority pending story
    → Implements + verifies
    → passes: true
    → git commit + progress.txt appended
    → <promise>COMPLETE</promise>
    → Loop checks: all stories done? Yes → exit. No → next iteration.
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [`CONTEXT.md`](CONTEXT.md) | Domain language and term definitions |
| [`AGENTS.md`](AGENTS.md) | Convention manual for this repo |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`how-the-loop-works.md`](how-the-loop-works.md) | Loop mechanics deep-dive |
| [`context-strategies.md`](context-strategies.md) | Context window management |
| [`testing-patterns.md`](testing-patterns.md) | E2E verification patterns |
| [`coding-agent.md`](coding-agent.md) | Coding agent protocol |
| [`initializer-agent.md`](initializer-agent.md) | Init agent guide |

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Based on Geoffrey Huntley's [Ralph Wiggum technique](https://ghuntley.com/ralph/). Inspired by [vercel-labs/ralph-loop-agent](https://github.com/vercel-labs/ralph-loop-agent).
