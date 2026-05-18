---
name: ralph-loop:init
description: >
  Initialize a target project for Ralph Loop. Scaffolds the environment bootstrap
  script (init.sh), project convention manual (AGENTS.md), handoff diary (progress.txt),
  and creates the initial git commit. Run AFTER generating prd.json.
trigger_phrases:
  - "initialize project"
  - "init ralph"
  - "scaffold for ralph"
  - "setup ralph project"
---

# Initialize Project

## What This Does

Scaffolds a target project for Ralph Loop. Does NOT implement any features — only creates the files Ralph needs to run.

## Prerequisites

- `prd.json` must exist in the target project root
- Git must be initialized (`git init` if needed)

## Process

1. Read `prd.json` to extract project metadata (name, tech stack, port)
2. Generate `init.sh` — environment bootstrap script:
   - Installs dependencies
   - Starts dev server in background
   - Waits for health check to pass
   - Prints `=== READY ===` on success
3. Generate `AGENTS.md` — project convention manual:
   - Project overview (name, tech stack, port)
   - How to run (from prd.json tech_stack)
   - NEVER DO rules (don't modify tests, don't fake verification)
   - Known issues and learnings sections (empty, filled by agents)
4. Generate `progress.txt` — handoff diary template with project metadata
5. Customize `CLAUDE.md` — copy from templates, substitute `{{PLACEHOLDERS}}`
6. If `CLAUDE.custom.md` exists, append it to the generated CLAUDE.md
7. Create initial git commit with all generated files
8. Run `bash init.sh` to verify the environment starts correctly

## After Initialization

The project is ready for Ralph Loop:
```
/ralph-loop:run
```

## NEVER

- Do NOT implement any features during initialization
- Do NOT install unnecessary dependencies
- Do NOT modify prd.json acceptance criteria
- Do NOT skip the environment verification step
