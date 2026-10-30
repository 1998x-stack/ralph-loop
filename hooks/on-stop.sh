#!/usr/bin/env bash
# Informational Stop hook. The CLI orchestrator owns the loop lifecycle.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "${1:-prd.json}" ]]; then exit 0; fi
node "$ROOT/src/core/prd-cli.js" summary "${1:-prd.json}"
