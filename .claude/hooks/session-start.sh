#!/bin/bash
# SessionStart hook: installs JS dependencies so typecheck and tests
# work in Claude Code on the web sessions (fresh container each session).
set -euo pipefail

# Only needed in the remote (web) environment; local machines manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Idempotent: npm install is safe to re-run and benefits from container caching.
npm install
