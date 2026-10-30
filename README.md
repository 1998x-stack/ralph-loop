# ⟳ Ralph Loop

> **V1.1 reliability-core status (development branch):** The executable Bash and Node drivers now share the same Node.js core. PRD validation, dependency readiness, bounded iterations, timeout handling, and no-progress stopping are implemented and tested. The Claude Plugin's `Stop` hook is **informational only**; it is not a second autonomous scheduler. Independent acceptance, durable attempts, rollback, cost tracking, and sandboxed isolation are **not yet implemented**.
>
> **Safety:** The runner no longer opts out of Claude CLI permission checks by default. Run automation only in a properly configured, restricted workspace. A successful `passes:true` flag is currently a legacy completion claim, **not** independent verification.

### V1.1 standalone quick start (run from the target project)

```bash
# Node.js 20+, git, and an installed agent CLI required
node /path/to/ralph-loop/src/core/prd-cli.js validate prd.json
node /path/to/ralph-loop/src/core/prd-cli.js summary prd.json
bash /path/to/ralph-loop/bin/ralph --dry-run
bash /path/to/ralph-loop/bin/ralph --max-iterations 20 --timeout-seconds 600
```

The default target-project prompt path is `./CLAUDE.md` (override with `--prompt`). For a nonzero exit, blocked PRD, a timeout, or three iterations without passing another story, the loop stops with a failure instead of silently continuing. `--cost-limit` explicitly fails until verifiable usage accounting is implemented.

See [V1.1 migration details](docs/v1.1-migration.md) and [ADR 0004](docs/adr/0004-one-orchestrator.md).

---


> **Deterministic-autonomous AI agent system.** A loop spawns fresh agents with zero context memory until every task is verifiably complete. The only "memory" is the file system.

> 中文一句话：确定性自治 Agent 系统——每轮生成一个零上下文的全新 agent，直到每个任务被可验证地完成；唯一的内存是文件系统。核心是让任何 agent 都从不过载上下文，避免进入「Dumb Zone」。

[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-brightgreen)]()
[![Bash](https://img.shields.io/badge/runtime-bash-orange)]()
[![Node.js](https://img.shields.io/badge/runtime-node.js-blue)]()
[![Claude Code Plugin](https://img.shields.io/badge/plugin-claude%20code-teal)]()

---

## TL;DR

```bash
# 1. Install the plugin
git clone https://github.com/1998x-stack/ralph-loop.git
claude plugin install ./ralph-loop --scope local

# 2. In YOUR project, generate a PRD
cd my-project
claude -p "/ralph-loop:generate-prd"

# 3. Initialize for Ralph
claude -p "/ralph-loop:init"

# 4. Run the loop (go AFK, come back to a finished project)
claude -p "/ralph-loop:run"
```

---

## The Problem

> 中文要点：上下文窗口没有 `free()`——累积到 ~70% 利用率后 agent 进入「Dumb Zone」：幻视、遗忘早期约束、决策质量下降。单会话 agent 会退化，多会话 agent 丢状态，多数「自治」方案脆弱。

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

```mermaid
flowchart TD
    A[Start] --> B[Check prd.json]
    B --> C{All stories pass?}
    C -->|Yes| D[Exit ✅]
    C -->|No| E[Pick highest-priority pending story]
    E --> F[Check dependencies]
    F --> G{Dependencies met?}
    G -->|No| H[Skip to next story]
    H --> E
    G -->|Yes| I[Spawn coding agent<br/>fresh context, zero memory]
    I --> J[Implement one story]
    J --> K[Verify<br/>browser / API / tests]
    K --> L{Verification?}
    L -->|Pass| M[Update prd.json → passes:true<br/>Append progress.txt<br/>git commit]
    M --> N[Output &lt;promise&gt;COMPLETE&lt;/promise&gt;]
    N --> B
    L -->|Fail| O{Attempts left?}
    O -->|Yes| I
    O -->|No| P[git revert<br/>Mark BLOCKED<br/>Log to progress.txt]
    P --> H
```

## Features

- **Fresh context per iteration** — No context rot. Subagent isolation guarantees every story starts clean.
- **File-based state machine** — `prd.json` is the single source of truth. `progress.txt` is the cross-session handoff diary. Git is the code snapshot.
- **Browser verification policy (not independently enforced yet)** — Prompt templates request Puppeteer/Playwright checks. An external test runner is planned.
- **Bounded execution** — Node driver now stops on repeated no-progress, timeout, and agent errors. Automatic rollback and durable per-story retry state are planned.
- **Claude Code plugin** — Install once, reuse across projects. Skills, agents, hooks — auto-discovered. Namespaced commands (`/ralph-loop:run`).
- **One authoritative engine** — Bash is a compatibility shim over the Node runner; plugin hooks report state rather than driving an independent loop.
- **GitHub Pages** — Live landing page at the repo's Pages URL with architecture overview, flow diagrams, and quick start.

## Quick Start

> **⚠️ Important:** All Ralph commands run from YOUR project directory, not the ralph-loop repo. Ralph reads `prd.json` and other state files from your project root.

### Install as Claude Code Plugin

```bash
git clone https://github.com/1998x-stack/ralph-loop.git
claude plugin install ./ralph-loop --scope local
claude plugin list  # should show ralph-loop
```

### Generate Your PRD

```bash
# In YOUR project directory
cd my-project
claude -p "/ralph-loop:generate-prd"

# This asks 5-10 questions, then generates prd.json
# with 50-200 user stories — each completable in one context window.
```

### Initialize Your Project

```bash
# Still in your project directory
claude -p "/ralph-loop:init"

# Creates:
#   prd.json      — task manifest (if not generated yet)
#   init.sh       — environment bootstrap
#   AGENTS.md     — project conventions
#   progress.txt  — cross-session handoff diary
```

### Run the Loop

```bash
# Autonomous mode (Claude Code) — from your project
cd my-project
claude -p "/ralph-loop:run"

# Standalone CLI (Bash) — from your project
cd my-project
./ralph-loop/bin/ralph --max-iterations 100 --verbose

# Programmatic (Node.js) — from your project
cd my-project
node ./ralph-loop/bin/ralph-node --max-iterations 50 --verbose
```

## Architecture

```
ralph-loop/                     ← plugin root
├── .claude-plugin/
│   └── plugin.json             ← manifest (name, version, components)
├── skills/
│   ├── ralph-loop/SKILL.md     ← /ralph-loop:run (loop coordinator)
│   ├── generate-prd/SKILL.md   ← /ralph-loop:generate-prd
│   └── initialize-project/SKILL.md ← /ralph-loop:init
├── agents/
│   ├── ralph-coding-agent.md   ← per-story subagent (fresh context)
│   ├── ralph-initializer.md    ← one-time project scaffolder
│   └── ralph-debugger.md       ← root cause analyzer (planned)
├── hooks/
│   ├── hooks.json              ← SessionStart + PostToolUse
│   ├── check-prd.sh            ← PRD status scanner
│   └── on-stop.sh              ← completion reporter
├── bin/
│   ├── ralph                   ← CLI (Bash)
│   └── ralph-node              ← CLI (Node.js)
├── templates/
│   ├── CLAUDE.md               ← prompt template
│   ├── AGENTS.md               ← convention manual template
│   ├── prd.json                ← PRD skeleton
│   ├── progress.txt            ← handoff diary template
│   ├── init-node.sh            ← Node.js/Next.js bootstrap
│   └── init-python.sh          ← Python/FastAPI bootstrap
├── .mcp.json                   ← bundled Puppeteer MCP
├── docs/
│   ├── index.html              ← GitHub Pages landing page
│   ├── base-dark.css           ← design system
│   └── adr/                    ← architecture decision records
├── CONTEXT.md                  ← domain language
├── README.md                   ← you are here
└── LICENSE                     ← MIT
```

## Core Constraints

| Rule | Description |
|------|-------------|
| **One story per iteration** | Never more. Each story must fit in one context window. |
| **Browser-verified only** | Frontend stories must pass browser automation. No "looks good to me." |
| **Never delete passing tests** | Tests are the safety net. Never remove a passing test. |
| **Configurable retry** | `maxRetries` field per story (default: 3). Exhausted → `git revert` → BLOCKED. |
| **Git commit every iteration** | Every iteration ends with a clean commit and updated `progress.txt`. |
| **Completion signal required** | `<promise>COMPLETE</promise>` — double-verified against `prd.json`. |

## State Machine

```mermaid
stateDiagram-v2
    [*] --> pending: story created
    pending --> in_progress: agent picks story
    in_progress --> passed: verification succeeds
    in_progress --> in_progress: retry (attempts < maxRetries)
    in_progress --> blocked: maxRetries exhausted
    passed --> [*]
    blocked --> pending: human intervenes / debug agent resolves
```

## The Harness Lineage（本系定位）

`ralph-loop` 把「文件系统即记忆」的增量约定推向**完全自治**：不再每会话人工驱动一次，而是闭环跑到全部任务通过：

| 成员 | 定位 | 与 ralph-loop 的关系 |
|------|------|----------------------|
| `agent-loop` | Init/Execute 跨会话编排 | ralph 在其基础上把「每会话一个 feature」升级为「全自动直至完成」 |
| `effective-harness` | 零配置 bash 双 Agent | 同源增量约定（one feature/session） |
| **ralph-loop** | 确定性自治闭环 | --- 本仓库：零上下文 + `/ralph-loop:run` |
| `loop-runner` | Generator–Evaluator 循环引擎 | 同为「生成→验证」循环；ralph 是 Claude Code 插件形态 |
| `tiny/mid-harness` | 执行引擎 | ralph 在其上层做自治编排与验收 |

> 关键差异：ralph-loop 强调**确定性**与**外部可复现验收**（浏览器自动化），且以 Claude Code 插件形式交付，一次安装、跨项目复用。

## Documentation

| Doc | Purpose |
|-----|---------|
| [`CONTEXT.md`](CONTEXT.md) | Domain language and term definitions |
| [`AGENTS.md`](AGENTS.md) | Convention manual for this repo |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`how-the-loop-works.md`](how-the-loop-works.md) | Loop mechanics deep-dive |
| [`context-strategies.md`](context-strategies.md) | Context window management |
| [`testing-patterns.md`](testing-patterns.md) | E2E verification patterns |
| [`agents/ralph-coding-agent.md`](agents/ralph-coding-agent.md) | Coding agent protocol |
| [`agents/ralph-initializer.md`](agents/ralph-initializer.md) | Init agent guide |
| [`skills/ralph-loop/SKILL.md`](skills/ralph-loop/SKILL.md) | Loop coordinator skill |
| [`docs/index.html`](docs/index.html) | GitHub Pages landing page |

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Based on Geoffrey Huntley's [Ralph Wiggum technique](https://ghuntley.com/ralph/). Inspired by [vercel-labs/ralph-loop-agent](https://github.com/vercel-labs/ralph-loop-agent).
