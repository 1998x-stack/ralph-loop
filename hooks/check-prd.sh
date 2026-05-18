#!/usr/bin/env bash
# check-prd.sh — SessionStart hook: scans prd.json for pending stories
# Called by Ralph Loop plugin hooks.json

PRD_FILE="${1:-prd.json}"

if [[ ! -f "$PRD_FILE" ]]; then
  echo "[ralph-loop] No prd.json found — skipping"
  exit 0
fi

python3 - "$PRD_FILE" <<'EOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
stories = data.get('userStories', data.get('features', []))
pending = [s for s in stories if not s.get('passes', False) and s.get('status') != 'blocked']
done = len(stories) - len(pending)
print(f"[ralph-loop] PRD: {done}/{len(stories)} complete, {len(pending)} pending")
if pending:
    next_story = sorted(pending, key=lambda x: x.get('priority', 99))[0]
    print(f"[ralph-loop] Next: {next_story['id']} — {next_story['description']}")
EOF
