#!/bin/bash
# Installs JS deps in Claude Code cloud sessions (fresh container each session).
# Local machines manage their own deps.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
[ -f package.json ] || exit 0
npm install
