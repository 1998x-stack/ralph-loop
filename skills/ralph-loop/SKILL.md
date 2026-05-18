---
name: ralph-loop
description: >
  Start the Ralph Loop autonomous agent system. Reads prd.json, picks the highest-priority
  pending story, spawns a coding agent with fresh context, verifies, commits, and repeats
  until all stories pass. Use when you want autonomous, fire-and-forget development.
trigger_phrases:
  - "run ralph"
  - "ralph loop"
  - "autonomous coding loop"
  - "run until complete"
  - "AFK agent"
  - "continuous agent"
  - "让 AI 自动跑"
---

# Ralph Loop — Autonomous Agent System

## What This Does

Ralph Loop runs AI coding agents in continuous iterations until every user story in `prd.json` is verifiably complete. Each iteration is a **fresh agent instance with zero context memory** — no context rot, no "Dumb Zone."

## When to Use

- You have a `prd.json` with user stories and want to build them all autonomously
- You want to go AFK and come back to a completed project
- You're working on a project too large for a single context window

## Prerequisites

- A target project with `prd.json`, `AGENTS.md`, `init.sh`, and `progress.txt` (run `/ralph-loop:init` first)
- Git initialized in the target project
- Dev server running (`bash init.sh` must succeed)

## Workflow

### 1. Orient

The coordinator reads `prd.json` to find the highest-priority pending story, then checks dependencies to ensure all prerequisites are complete.

### 2. Spawn Coding Agent

A fresh coding agent is spawned as a subagent with:
- The CLAUDE.md prompt template (with project-specific substitutions)
- The selected story's acceptance criteria
- Access to browser automation for frontend verification
- Zero memory of prior iterations

### 3. Verify

The coding agent implements ONE story, then verifies:
- **Frontend stories**: browser automation (Puppeteer/Playwright)
- **API stories**: curl-based endpoint testing
- **Logic stories**: unit/integration tests

### 4. Commit State

After verification passes:
- `prd.json`: sets `passes: true` for the completed story
- `progress.txt`: appends session entry with story ID, changes, and next steps
- Git: commits with conventional commit message

### 5. Signal & Repeat

The coding agent outputs `<promise>COMPLETE</promise>`. The coordinator detects this, double-verifies against `prd.json`, and spawns the next iteration.

## Core Constraints

- **One story per iteration** — never more
- **Browser verification required** for all frontend stories
- **Never set `passes: true`** without running the actual verification
- **Never delete or modify** tests that already pass
- **Two-failure bailout**: `git revert` → mark BLOCKED → move on

## Error Recovery

- **1st failure**: Retry with same approach, check for obvious issues
- **2nd failure**: Different approach, read error logs carefully
- **3rd failure**: Auto-revert, mark story BLOCKED in `progress.txt`, set `priority: 99`, spawn debug agent for root cause analysis
- **Environment failure**: Fix environment (`bash init.sh`), retry

## Completion

When all stories have `passes: true` in `prd.json`, output:
```
<promise>COMPLETE</promise>
```
