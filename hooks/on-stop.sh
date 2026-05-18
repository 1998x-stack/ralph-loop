#!/usr/bin/env bash
# on-stop.sh — PostToolUse hook: runs after agent stops
# Called by Ralph Loop plugin hooks.json
# Checks if all stories are complete and reports status

PRD_FILE="${1:-prd.json}"

if [[ ! -f "$PRD_FILE" ]]; then
  exit 0
fi

python3 - "$PRD_FILE" <<'EOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
stories = data.get('userStories', data.get('features', []))
done = sum(1 for s in stories if s.get('passes', False))
total = len(stories)
if done == total:
    print(f"[ralph-loop] ALL COMPLETE: {done}/{total} stories passed")
else:
    pending = [s for s in stories if not s.get('passes', False)]
    blocked = [s for s in pending if s.get('status') == 'blocked']
    print(f"[ralph-loop] Progress: {done}/{total} complete, {len(blocked)} blocked, {len(pending) - len(blocked)} pending")
EOF
