# AGENTS.md — Ralph Loop Project Manual

> Read at the START of every session working on Ralph Loop itself.
> This is NOT a target-project manual — it describes how the Ralph Loop system works.

---

## What This Is

Ralph Loop is a deterministic-autonomous AI agent system. A Bash `while` loop spawns fresh agent instances with zero context memory. Each iteration reads state from files, completes ONE user story, writes state back, and exits. The only "memory" is the file system.

**Core principle**: fresh context per iteration = no context rot, no "dumb zone."

---

## How to Orient

Read these in order when starting work on Ralph Loop itself:

1. **`CONTEXT.md`** — Domain language, key terms, relationships. Defines what "Coordinator", "Coding Agent", "Dumb Zone" etc. mean precisely.
2. **`docs/adr/`** — Architecture Decision Records. Why we chose the plugin model, subagent isolation, and hooks-based coordination.
3. **This file (AGENTS.md)** — Operational conventions, file roles, gotchas.

## File Roles

| File | Purpose | Who Writes It |
|------|---------|---------------|
| `ralph.sh` | Bash outer loop driver (CLI) | Humans (rare edits) |
| `ralph-node.js` | Node.js outer loop driver (programmatic) | Humans (rare edits) |
| `SKILL.md` | OpenCode/Claude Code plugin manifest | Humans |
| `CLAUDE.md` | Fixed prompt template fed to each agent iteration | Humans (customize per target project) |
| `prd.json` | Task manifest; `passes: bool` per story = single source of truth | Initializer agent → coding agents |
| `AGENTS.md` | Living convention manual (this file) | Agents (cumulative learning) |
| `CONTEXT.md` | Domain language and term definitions | Humans (from grill-with-docs) |
| `progress.txt` | Handoff diary between iterations | Each coding agent appends |
| `docs/adr/NNNN-*.md` | Architecture Decision Records | Humans (significant decisions) |
| `legacy/coding-agent.md` | Original coding agent protocol (deprecated) | Humans (archived) |
| `legacy/initializer-agent.md` | Original init agent guide (deprecated) | Humans (archived) |
| `legacy/prd-generator-prompt.md` | Original PRD generation prompt (deprecated) | Humans (archived) |
| `agents/ralph-coding-agent.md` | Current coding agent subagent | Humans (plugin) |
| `agents/ralph-initializer.md` | Current initializer subagent | Humans (plugin) |
| `skills/generate-prd/SKILL.md` | Current PRD generation skill | Humans (plugin) |
| `context-strategies.md` | Context window management strategies | Humans (reference) |
| `testing-patterns.md` | E2E verification patterns | Humans (reference) |
| `how-the-loop-works.md` | Loop mechanics deep-dive | Humans (reference) |
| `docs/*.md` | Blog posts and promotional content | Humans |

---

## How to Deploy Ralph onto a Target Project

```
1. PRD Generation    → Generate prd.json for the target project
2. Initialization    → Run initializer agent: creates init.sh, AGENTS.md, progress.txt, git init
3. Customize CLAUDE.md → Replace placeholders with project-specific values
4. Run the Loop      → bash ralph.sh (inside target project)
```

Ralph Loop itself has no `init.sh`, no build, no tests, and no dev server. It's a scripting toolkit that gets deployed *into* target projects.

---

## Completion Signal Protocol

Every agent iteration MUST output:
```
<promise>COMPLETE</promise>
```

The outer loop uses `grep` to detect this signal. **Double verification**: the loop also checks `prd.json` to confirm all stories have `passes: true`. Signal alone is not enough — data must back it up.

---

## Core Constraints (Non-Negotiable)

- One user story per agent iteration — never more.
- All frontend changes must be verified via browser automation (dev-browser / Puppeteer / Playwright).
- Never set `passes: true` without running the actual verification.
- Never delete or modify tests that already pass.
- If a bug resists 2 fix attempts: `git revert`, mark story BLOCKED in `progress.txt`, set priority to 99, move on.
- Every iteration ends with `git commit` + updated `progress.txt`.
- If context is near full: save clean state, output `<promise>COMPLETE</promise>`, let the loop restart a fresh instance.

---

## State Machine

```
prd.json (passes: false)  →  Agent picks highest-priority pending story
    →  Implements + verifies
    →  passes: true
    →  git commit + progress.txt
    →  <promise>COMPLETE</promise>
    →  Loop checks: all stories done? Yes → exit. No → next iteration.
```

---

## SKILL.md Integration

`SKILL.md` is an OpenCode/Claude Code plugin manifest. It exposes Ralph Loop as a loadable skill. Key fields:
- `name: ralph-loop`
- `trigger_phrases`: "run ralph", "ralph loop", "AFK agent", "让 AI 自动跑"
- The skill content itself describes the five core components and quick-start flow.

When editing SKILL.md, keep it under ~150 lines. It's loaded every time the skill is invoked.

---

## Known Gotchas

- `prd.json` uses `userStories` OR `features` as the story array key — both code paths exist in the scripts. The `userStories` key is the canonical one.
- `ralph.sh` expects `scripts/ralph/CLAUDE.md` but this repo has `CLAUDE.md` at the root. The `--prompt` flag overrides this.
- The AGENTS.md in this repo is a **system manual** for Ralph Loop itself. Target projects get their own AGENTS.md (generated by the initializer agent) which is a Next.js convention template.
- `ralph.sh` works with `claude` or `amp` as the AI tool. Claude Code requires `--dangerously-skip-permissions` for unattended operation.
