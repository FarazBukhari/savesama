#!/bin/bash
# Installs server (venv) and app (npm) deps in Claude Code cloud sessions (fresh container
# each session). Local machines manage their own deps.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
if [ -f server/pyproject.toml ]; then
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q -e server
  echo "export PATH=\"$CLAUDE_PROJECT_DIR/.venv/bin:\$PATH\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi
if [ -f app/package-lock.json ]; then
  (cd app && npm ci --no-audit --no-fund)
fi
