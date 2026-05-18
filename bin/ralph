#!/usr/bin/env bash
# =============================================================================
# ralph.sh — The Ralph Loop Core Driver
# =============================================================================
#
# WHAT THIS DOES:
#   Runs an AI coding agent (Claude Code / Amp) in a Bash while-loop.
#   Each iteration = fresh agent instance with clean context.
#   State persists via: prd.json, progress.txt, git history, AGENTS.md.
#   Loop exits when agent outputs <promise>COMPLETE</promise>.
#
# USAGE:
#   bash scripts/ralph/ralph.sh [OPTIONS]
#
# OPTIONS:
#   --max-iterations N    Max loop iterations before giving up (default: 100)
#   --tool claude|amp     AI tool to use (default: claude)
#   --prompt PATH         Path to prompt file (default: scripts/ralph/CLAUDE.md)
#   --dry-run             Print what would run, don't execute
#   --verbose             Show full agent output (default: show summary)
#
# EXAMPLES:
#   bash scripts/ralph/ralph.sh
#   bash scripts/ralph/ralph.sh --max-iterations 50 --tool amp
#   bash scripts/ralph/ralph.sh --prompt scripts/ralph/CLAUDE.md --verbose
#
# HOW THE LOOP WORKS (core principle):
#
#   ┌─────────────────────────────────────────────────────────┐
#   │  while true:                                            │
#   │    1. Spawn fresh AI agent (zero context memory)        │
#   │    2. Feed it CLAUDE.md (fixed prompt stack)            │
#   │    3. Agent reads prd.json → picks 1 story → works      │
#   │    4. Agent commits code + updates state files          │
#   │    5. Check agent output for <promise>COMPLETE</promise> │
#   │       → Found?  EXIT LOOP ✅                            │
#   │       → Not found? NEXT ITERATION 🔄                   │
#   └─────────────────────────────────────────────────────────┘
#
# =============================================================================

set -euo pipefail

# ─── Color Codes ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Defaults ─────────────────────────────────────────────────────────────────
MAX_ITERATIONS=100
AI_TOOL="claude"
PROMPT_FILE="scripts/ralph/CLAUDE.md"
DRY_RUN=false
VERBOSE=false
COMPLETION_SIGNAL="<promise>COMPLETE</promise>"
LOG_FILE="ralph-run.log"
START_TIME=$(date +%s)

# ─── Argument Parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --tool)           AI_TOOL="$2"; shift 2 ;;
    --prompt)         PROMPT_FILE="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --verbose)        VERBOSE=true; shift ;;
    -h|--help)
      head -40 "$0" | grep "^#" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ─── Validation ───────────────────────────────────────────────────────────────
validate_environment() {
  echo -e "${CYAN}${BOLD}[Ralph] Validating environment...${RESET}"

  # Check prompt file exists
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo -e "${RED}✗ Prompt file not found: $PROMPT_FILE${RESET}"
    echo -e "  Run: cp scripts/ralph/templates/CLAUDE.md $PROMPT_FILE"
    exit 1
  fi

  # Check prd.json exists
  if [[ ! -f "prd.json" ]]; then
    echo -e "${RED}✗ prd.json not found${RESET}"
    echo -e "  Run the PRD generator first. See: scripts/ralph/prd-generator-prompt.md"
    exit 1
  fi

  # Check AI tool is available
  case "$AI_TOOL" in
    claude)
      if ! command -v claude &> /dev/null; then
        echo -e "${RED}✗ 'claude' not found. Install Claude Code: npm install -g @anthropic-ai/claude-code${RESET}"
        exit 1
      fi
      ;;
    amp)
      if ! command -v amp &> /dev/null; then
        echo -e "${RED}✗ 'amp' not found. Install Amp Code: https://ampcode.com${RESET}"
        exit 1
      fi
      ;;
    *)
      echo -e "${RED}✗ Unknown tool: $AI_TOOL (use 'claude' or 'amp')${RESET}"
      exit 1
      ;;
  esac

  # Check git is initialized
  if ! git rev-parse --git-dir &> /dev/null; then
    echo -e "${RED}✗ Not a git repository. Run: git init && git add -A && git commit -m 'Initial commit'${RESET}"
    exit 1
  fi

  # Check progress.txt exists
  if [[ ! -f "progress.txt" ]]; then
    echo -e "${YELLOW}⚠ progress.txt not found — creating empty one${RESET}"
    echo "# Ralph Progress Log" > progress.txt
    echo "# Created: $(date)" >> progress.txt
    echo "" >> progress.txt
  fi

  echo -e "${GREEN}✓ Environment validated${RESET}"
}

# ─── PRD Status ───────────────────────────────────────────────────────────────
get_prd_status() {
  python3 - <<'EOF'
import json, sys
try:
    with open('prd.json') as f:
        data = json.load(f)
    stories = data.get('userStories', data.get('features', []))
    total = len(stories)
    done = sum(1 for s in stories if s.get('passes', False))
    pending = total - done
    print(f"{done}/{total} stories complete ({pending} pending)")
except Exception as e:
    print(f"Error reading prd.json: {e}")
    sys.exit(1)
EOF
}

all_stories_complete() {
  python3 - <<'EOF'
import json, sys
try:
    with open('prd.json') as f:
        data = json.load(f)
    stories = data.get('userStories', data.get('features', []))
    if all(s.get('passes', False) for s in stories):
        sys.exit(0)  # All complete
    else:
        sys.exit(1)  # Not all complete
except:
    sys.exit(1)
EOF
}

# ─── Build AI Command ─────────────────────────────────────────────────────────
build_ai_command() {
  case "$AI_TOOL" in
    claude)
      # Claude Code: read prompt from stdin, skip permission prompts for automation
      echo "claude --dangerously-skip-permissions < \"$PROMPT_FILE\""
      ;;
    amp)
      # Amp: similar pattern
      echo "amp < \"$PROMPT_FILE\""
      ;;
  esac
}

# ─── Run Single Iteration ─────────────────────────────────────────────────────
run_iteration() {
  local iteration=$1
  local output_file
  output_file=$(mktemp /tmp/ralph-iter-XXXXXX.txt)

  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BLUE}${BOLD}  Ralph Iteration #${iteration}   $(date '+%H:%M:%S')${RESET}"
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  PRD Status: $(get_prd_status)"
  echo -e "  Tool: ${AI_TOOL} | Prompt: ${PROMPT_FILE}"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}[DRY RUN] Would execute: $(build_ai_command)${RESET}"
    # Simulate finding complete signal on 3rd iteration in dry run
    [[ $iteration -ge 3 ]] && echo "$COMPLETION_SIGNAL" > "$output_file"
    return 0
  fi

  # Run the AI tool, capture output
  local exit_code=0
  if [[ "$VERBOSE" == "true" ]]; then
    # Show output live AND save to file
    eval "$(build_ai_command)" 2>&1 | tee "$output_file" || exit_code=$?
  else
    # Save to file only, show summary after
    eval "$(build_ai_command)" > "$output_file" 2>&1 || exit_code=$?
    # Show last 10 lines as summary
    echo -e "${CYAN}--- Agent Output Summary (last 10 lines) ---${RESET}"
    tail -10 "$output_file"
    echo -e "${CYAN}--- End Summary ---${RESET}"
  fi

  # Append to main log
  {
    echo "=== Iteration $iteration === $(date) ==="
    cat "$output_file"
    echo ""
  } >> "$LOG_FILE"

  # Check for completion signal
  if grep -q "$COMPLETION_SIGNAL" "$output_file"; then
    rm -f "$output_file"
    return 0  # Signal found → iteration "succeeded" in completion sense
  fi

  # Check if exit code was error
  if [[ $exit_code -ne 0 ]]; then
    echo -e "${YELLOW}⚠ Agent exited with code $exit_code${RESET}"
  fi

  rm -f "$output_file"
  return 1  # No completion signal found
}

# ─── Elapsed Time Formatter ───────────────────────────────────────────────────
format_elapsed() {
  local seconds=$(( $(date +%s) - START_TIME ))
  printf '%dh %dm %ds' $((seconds/3600)) $((seconds%3600/60)) $((seconds%60))
}

# ─── Signal Handlers ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}${BOLD}[Ralph] Interrupted after $(format_elapsed). Progress saved in prd.json + progress.txt.${RESET}"
  exit 130
}
trap cleanup INT TERM

# ─── MAIN LOOP ────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ██████╗  █████╗ ██╗     ██████╗ ██╗  ██╗"
  echo "  ██╔══██╗██╔══██╗██║     ██╔══██╗██║  ██║"
  echo "  ██████╔╝███████║██║     ██████╔╝███████║"
  echo "  ██╔══██╗██╔══██║██║     ██╔═══╝ ██╔══██║"
  echo "  ██║  ██║██║  ██║███████╗██║     ██║  ██║"
  echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝"
  echo -e "${RESET}"
  echo -e "${BOLD}  Autonomous AI Agent Loop — Geoffrey Huntley Technique${RESET}"
  echo -e "  Max iterations: ${MAX_ITERATIONS} | Tool: ${AI_TOOL}"
  echo ""

  validate_environment

  # Pre-check: already complete?
  if all_stories_complete; then
    echo -e "${GREEN}${BOLD}✅ All PRD stories already pass! Nothing to do.${RESET}"
    exit 0
  fi

  local iteration=1
  local found_completion=false

  while [[ $iteration -le $MAX_ITERATIONS ]]; do

    # Pre-iteration check: are we done?
    if all_stories_complete; then
      echo -e "${GREEN}${BOLD}"
      echo "  ✅ All stories complete after $((iteration - 1)) iterations!"
      echo "  ⏱  Total time: $(format_elapsed)"
      echo -e "${RESET}"
      found_completion=true
      break
    fi

    # Run one agent iteration
    if run_iteration "$iteration"; then
      # Agent output contained the completion signal
      echo ""
      echo -e "${GREEN}${BOLD}  🎯 Completion signal detected in iteration #${iteration}${RESET}"

      # Verify prd.json actually reflects completion
      if all_stories_complete; then
        echo -e "${GREEN}${BOLD}  ✅ Verified: all PRD stories pass!${RESET}"
        found_completion=true
        break
      else
        echo -e "${YELLOW}  ⚠ Completion signal found but prd.json has pending stories.${RESET}"
        echo -e "  $(get_prd_status)"
        echo -e "  Continuing loop to finish remaining stories..."
      fi
    fi

    echo ""
    echo -e "  Iteration #${iteration} complete. $(get_prd_status). Elapsed: $(format_elapsed)"
    echo -e "  Starting next iteration in 3 seconds... (Ctrl+C to stop)"
    sleep 3

    iteration=$((iteration + 1))
  done

  echo ""
  if [[ "$found_completion" == "true" ]]; then
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${GREEN}${BOLD}  RALPH COMPLETE ✅${RESET}"
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  Final PRD: $(get_prd_status)"
    echo -e "  Total time: $(format_elapsed)"
    echo -e "  Log: $LOG_FILE"
    echo ""
    git log --oneline -5
    exit 0
  else
    echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${RED}${BOLD}  RALPH STOPPED — Max iterations ($MAX_ITERATIONS) reached${RESET}"
    echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  Final PRD: $(get_prd_status)"
    echo -e "  Time elapsed: $(format_elapsed)"
    echo -e "  Run again with higher --max-iterations or investigate stuck stories."
    exit 1
  fi
}

main "$@"
